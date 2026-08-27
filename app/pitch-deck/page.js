'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth, getDriveToken, forgetDriveToken } from '@/lib/AuthContext';
import { DriveAuthError, uploadPptxAsGoogleSlides } from '@/lib/googleSlides';
import { createReport } from '@/lib/reportStore';
import { logDeckEvent, DECK_DOWNLOADED, REPORT_CREATED, SLIDES_EXPORTED } from '@/lib/usage';
import buildPitchDeck from '@/lib/deck/pitch/buildDeck';
import { statsToAnalytics, toDeckArgs } from '@/lib/deckAdapter';
import { CONTENT_CATEGORIES, categoryById, categoryForBrand } from '@/lib/deck/creatorCategories';

// One URL in, a finished deck out.
//
// The report flow asks a person for the brand's facts a field at a time. This
// asks for nothing but the website and shows what came back, because the point
// is the opposite: a salesperson looking at a prospect for the first time wants
// to know what the tool already knows before deciding whether to spend a
// browse2api lookup on it.
//
// Which is why every panel below states what was found *and* what its absence
// costs. "No brand colour" is not an error; it means the deck picks a ground
// from the domain instead, and saying so is more useful than a red cross.

const STEPS = [
  { key: 'site', label: 'Website' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'matches', label: 'Our content' },
];

const OFFERS = [
  ['both', 'Podcast + influencer marketing', 11],
  ['podcast', 'Podcast only', 10],
  ['marketing', 'Influencer marketing only', 10],
];

const compact = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(v * 10) / 10);
};

function instagramHandleFrom(brand) {
  const url = brand?.social_links?.instagram;
  if (!url) return null;
  const match = url.match(/instagram\.com\/([\w.]+)/);
  return match ? match[1] : null;
}

/** A curated category pick in the wire shape the rest of this page speaks.
 *
 * `curatedBrand` is the field that earns its keep. The track-record slide reads
 * it in place of a caption, so a curated pick prints "Lenskart" where the
 * keyword matcher would print the first seventy characters of a reel caption —
 * on a slide headed "Brands We've Worked With", that is the whole difference.
 *
 * tier is 'brand' by construction: somebody chose this pick *because* it names
 * the brand, which is exactly what that flag means everywhere else. */
function itemFromPick(pick) {
  return {
    id: pick.url,
    platform: pick.platform,
    url: pick.url,
    title: pick.title,
    likes: pick.likes ?? null,
    comments: pick.comments ?? null,
    views: pick.views ?? null,
    publishedAt: pick.date || null,
    curatedBrand: pick.brand,
    curatedNote: pick.note,
    tier: 'brand',
  };
}

function fileSlug(name) {
  return String(name || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** A labelled row. `missing` is not a failure state — it is the sentence that
 * says what the deck does instead. */
function Row({ label, value, missing }) {
  return (
    <div style={{ display: 'flex', gap: '14px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ flex: '0 0 150px', fontSize: '13px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ flex: 1, fontSize: '13px', color: missing ? 'var(--text-muted)' : 'var(--text-primary)', fontStyle: missing ? 'italic' : 'normal', wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  );
}

export default function PitchDeckPage() {
  const { connectDrive } = useAuth();

  const [url, setUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState({});
  const [error, setError] = useState('');

  const [brand, setBrand] = useState(null);
  const [igStats, setIgStats] = useState(null);
  const [igError, setIgError] = useState('');
  // Seeded from the site's own link, but editable. The scraper finds whatever
  // the footer points at, which on a multi-brand site is sometimes the parent
  // company's account — and the lookup 502s often enough on its own that
  // retyping a handle the page already knew was the most repeated action in
  // the flow this replaces.
  const [igHandle, setIgHandle] = useState('');
  const [retryingIg, setRetryingIg] = useState(false);
  const [matches, setMatches] = useState([]);
  const [matchNote, setMatchNote] = useState('');

  // Hand-picking from the back catalogue, for when the matcher's answer is not
  // the one you had in mind. /api/creator-library returns the same wire shape
  // as /api/creator-matches, so a search hit drops straight into `matches`.
  const [libQuery, setLibQuery] = useState('');
  const [libPlatform, setLibPlatform] = useState('');
  const [libItems, setLibItems] = useState(null);
  const [libTotal, setLibTotal] = useState(0);
  const [libSearching, setLibSearching] = useState(false);
  // The curated shelves — 13 categories of hand-chosen collabs and episodes,
  // each pick carrying the brand it is about. Seeded from the scrape when the
  // brand's own words give it away, but always overridable: the guess reads
  // one page of copy, and the person reading the prospect's whole site knows
  // better.
  const [categoryId, setCategoryId] = useState('');

  const [offerType, setOfferType] = useState('both');
  const [reportId, setReportId] = useState(null);
  const [busy, setBusy] = useState('');
  const [slidesUrl, setSlidesUrl] = useState('');
  const [needsDrive, setNeedsDrive] = useState(false);

  const mark = (key, state) => setSteps((s) => ({ ...s, [key]: state }));

  /** One paid lookup. Shared by the run and the retry so there is one
   * description of what a failure leaves behind. */
  async function auditInstagram(handle) {
    mark('instagram', 'active');
    setIgError('');
    try {
      const res = await fetch('/api/ig-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'the lookup failed');
      setIgStats(data.stats);
      mark('instagram', 'done');
      return true;
    } catch (err) {
      setIgStats(null);
      setIgError(err.message || 'the lookup failed');
      mark('instagram', 'error');
      return false;
    }
  }

  async function retryInstagram() {
    const handle = igHandle.trim().replace(/^@/, '');
    if (!handle || retryingIg) return;
    setRetryingIg(true);
    await auditInstagram(handle);
    setRetryingIg(false);
  }

  async function searchLibrary() {
    if (libSearching) return;
    setLibSearching(true);
    try {
      const params = new URLSearchParams({ q: libQuery.trim(), limit: '24' });
      if (libPlatform) params.set('platform', libPlatform);
      const res = await fetch(`/api/creator-library?${params}`);
      const data = await res.json();
      setLibItems(data.items || []);
      setLibTotal(data.total || 0);
    } catch {
      setLibItems([]);
      setLibTotal(0);
    } finally {
      setLibSearching(false);
    }
  }

  /** Show a category's picks in the results list. No fetch — these are
   * compiled into the bundle, not searched for. */
  function chooseCategory(id) {
    setCategoryId(id);
    const category = id ? categoryById(id) : null;
    if (!category) {
      setLibItems(null);
      setLibTotal(0);
      return;
    }
    const items = category.picks.map(itemFromPick);
    setLibItems(items);
    setLibTotal(items.length);
  }

  /** Take the whole shelf. Replaces the selection rather than appending to it:
   * choosing a category is a decision about what this deck should prove, and
   * leaving the keyword matcher's guesses underneath would mix two answers. */
  function applyCategory() {
    const category = categoryId ? categoryById(categoryId) : null;
    if (!category) return;
    setMatches(category.picks.map(itemFromPick));
  }

  const addMatch = (item) => setMatches((list) => (list.some((m) => m.id === item.id) ? list : [...list, item]));
  const removeMatch = (id) => setMatches((list) => list.filter((m) => m.id !== id));

  async function run() {
    if (!url.trim() || running) return;
    setRunning(true);
    setError('');
    setBrand(null); setIgStats(null); setIgError(''); setIgHandle(''); setMatches([]); setMatchNote('');
    setLibItems(null); setLibQuery(''); setLibTotal(0); setCategoryId('');
    setReportId(null); setSlidesUrl(''); setNeedsDrive(false);
    setSteps({ site: 'active' });

    // 1 — the website. Everything else keys off what this finds, so a failure
    // here is the only one that stops the run.
    let scraped;
    try {
      const res = await fetch('/api/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not read that site.');
      scraped = data.brand;
      setBrand(scraped);
      // Guessed from the brand's own description and About copy. Returns null
      // rather than picking something when nothing matches, which leaves the
      // dropdown on "no category" and the keyword matcher in charge.
      setCategoryId(categoryForBrand(scraped)?.id || '');
      mark('site', 'done');
    } catch (err) {
      mark('site', 'error');
      setError(err.message || 'Could not read that site.');
      setRunning(false);
      return;
    }

    // 2 — their Instagram, if the site named one. This is the call that bills,
    // so it only runs when the site actually links an account.
    const handle = instagramHandleFrom(scraped);
    // Filled before the call, not after it fails — that is what makes the
    // retry below one click rather than a retype.
    setIgHandle(handle || '');
    if (handle) {
      await auditInstagram(handle);
    } else {
      setIgError('their site does not link an Instagram account — type one below');
      mark('instagram', 'error');
    }

    // 3 — our own content, scored against their About copy.
    mark('matches', 'active');
    try {
      const res = await fetch('/api/creator-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: scraped.name || url.trim(),
          about: { description: (scraped.about?.about_text || scraped.description || '').slice(0, 3000) },
          limit: 5,
        }),
      });
      const data = await res.json();
      setMatches(data.matches || []);
      if (!data.matches?.length) {
        setMatchNote(
          data.reason === 'no-creator-data'
            ? 'No creator library found on the server.'
            : "Nothing in our library is close enough to this brand's category."
        );
      }
      mark('matches', data.matches?.length ? 'done' : 'error');
    } catch {
      setMatchNote('The match step failed.');
      mark('matches', 'error');
    }

    setRunning(false);
  }

  const reportData = {
    brandName: brand?.name || url.trim(),
    instagramAnalytics: statsToAnalytics(igStats),
    creatorMatches: matches,
    igProfile: igStats ? { biography: igStats.biography || '' } : null,
  };

  function buildPptx() {
    return buildPitchDeck(
      toDeckArgs({ report: { brandName: reportData.brandName }, reportData, brand, offerType })
    );
  }

  /** The row this deck gets in the reports list. Created once and reused, so
   * exporting twice does not leave two entries for one prospect. */
  async function ensureReport() {
    if (reportId) return reportId;
    const id = await createReport({
      brandName: reportData.brandName,
      instagram: igStats?.username ? `@${igStats.username}` : '',
      reportData: { ...reportData, brandUrl: url.trim(), brand, offerType, generatedAt: new Date().toISOString() },
    });
    setReportId(id);
    logDeckEvent(REPORT_CREATED, id);
    return id;
  }

  async function exportToSlides() {
    if (busy) return;
    setBusy('slides');
    setError('');
    try {
      const token = getDriveToken();
      if (!token) throw new DriveAuthError('no Google Drive permission yet');
      const blob = await buildPptx().write({ outputType: 'blob' });
      const file = await uploadPptxAsGoogleSlides(token, blob, `${reportData.brandName} — Open Grey Media Pitch`);
      const id = await ensureReport();
      logDeckEvent(SLIDES_EXPORTED, id);
      setSlidesUrl(file.url);
      window.open(file.url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof DriveAuthError) {
        // A stale token would otherwise fail this way forever. The download
        // button stays live throughout — getting here means a lookup has
        // already been spent, and an expired Google token is not a reason to
        // walk away without the deck.
        forgetDriveToken();
        setNeedsDrive(true);
        setError('Google needs permission again. Reconnect, or download the .pptx instead.');
      } else {
        setError(err.message || 'Could not send it to Google Slides.');
      }
    } finally {
      setBusy('');
    }
  }

  async function download() {
    if (busy) return;
    setBusy('download');
    setError('');
    try {
      const blob = await buildPptx().write({ outputType: 'blob' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${fileSlug(reportData.brandName)}-open-grey-media-proposal.pptx`;
      a.click();
      URL.revokeObjectURL(href);
      const id = await ensureReport();
      logDeckEvent(DECK_DOWNLOADED, id);
    } catch (err) {
      setError(err.message || 'Could not build the .pptx.');
    } finally {
      setBusy('');
    }
  }

  const colour = brand?.visual_identity?.palette?.primary;
  const socials = Object.entries(brand?.social_links || {});
  const slideCount = offerType === 'both' ? 11 : 10;

  return (
    <div className="page" style={{ padding: '32px 0 120px' }}>
      <div className="container" style={{ maxWidth: '820px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-ghost btn-sm">← All reports</Link>
        </div>

        <h1 style={{ marginBottom: '8px' }}>OGM Pitch Deck</h1>
        <p style={{ fontSize: '14px', marginBottom: '24px', color: 'var(--text-secondary)' }}>
          Paste a prospect&rsquo;s website. It reads their brand, audits the Instagram account
          they link to, and finds our own content about their category — then builds the deck.
        </p>

        {/* ---------- INPUT ---------- */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="url"
              className="input"
              style={{ flex: '1 1 300px' }}
              placeholder="https://example-brand.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
              disabled={running}
            />
            <button type="button" className="btn btn-primary" onClick={run} disabled={running || !url.trim()}>
              {running ? 'Reading…' : brand ? 'Run again' : 'Build deck'}
            </button>
          </div>

          {(running || brand) && (
            <div style={{ display: 'flex', gap: '18px', marginTop: '16px', flexWrap: 'wrap' }}>
              {STEPS.map(({ key, label }) => {
                const state = steps[key];
                const mark_ = state === 'done' ? '✓' : state === 'error' ? '!' : state === 'active' ? '…' : '·';
                const colours = { done: 'var(--success)', error: 'var(--error)', active: 'var(--accent)' };
                return (
                  <span key={key} style={{ fontSize: '13px', color: colours[state] || 'var(--text-muted)' }}>
                    <strong style={{ marginRight: '6px' }}>{mark_}</strong>{label}
                  </span>
                );
              })}
            </div>
          )}

          {error && (
            <div style={{ marginTop: '14px', padding: '10px 12px', border: '1px solid var(--error)', borderRadius: '6px', color: 'var(--error)', fontSize: '13px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1 }}>{error}</span>
              {needsDrive && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => connectDrive('/pitch-deck')}>
                  Reconnect Google
                </button>
              )}
            </div>
          )}
        </div>

        {/* ---------- WHAT CAME OFF THE SITE ---------- */}
        {brand && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>From their website</h3>
            <p style={{ fontSize: '13px', marginBottom: '14px' }}>
              Everything the deck knows about this brand, and what it does when a piece is missing.
            </p>

            <Row label="Name" value={brand.name || 'Not found — the deck prints “Your Brand”'} missing={!brand.name} />
            <Row label="Final URL" value={brand.final_url} />
            <Row label="Platform" value={brand.platform === 'unknown' ? 'Not identified' : brand.platform} missing={brand.platform === 'unknown'} />
            <Row
              label="Brand colour"
              value={colour
                ? <><span style={{ display: 'inline-block', width: '11px', height: '11px', borderRadius: '2px', background: colour, border: '1px solid var(--border)', marginRight: '7px', verticalAlign: 'middle' }} />{colour}{brand.visual_identity?.palette?.secondary ? ` · ${brand.visual_identity.palette.secondary}` : ''}</>
                : 'None found — the deck picks a ground from the domain instead'}
              missing={!colour}
            />
            <Row
              label="Where from"
              value={(brand.visual_identity?.source?.css_vars || []).join(', ')
                || (brand.visual_identity?.source?.logo_colors || []).join(', ')
                || '—'}
              missing={!brand.visual_identity}
            />
            <Row label="Logo" value={brand.logo_url || 'None found'} missing={!brand.logo_url} />
            <Row
              label="Social channels"
              value={socials.length
                ? socials.map(([k, v]) => <a key={k} href={v} target="_blank" rel="noreferrer" style={{ marginRight: '10px' }}>{k}</a>)
                : 'None found'}
              missing={!socials.length}
            />
            <Row
              label="Running ads"
              value={brand.ads_signal?.meta_pixel || brand.ads_signal?.google_ads
                ? `Yes — ${[brand.ads_signal.meta_pixel && 'Meta pixel', brand.ads_signal.google_ads && 'Google'].filter(Boolean).join(' + ')}`
                : 'Not detected'}
              missing={!brand.ads_signal?.meta_pixel && !brand.ads_signal?.google_ads}
            />
            <Row
              label="About copy"
              value={brand.about?.about_text
                ? `${brand.about.about_text.length.toLocaleString()} characters — this is what our content is matched against`
                : 'None — the match step has nothing to score on'}
              missing={!brand.about?.about_text}
            />
            <Row label="Description" value={brand.description || 'None'} missing={!brand.description} />
          </div>
        )}

        {/* ---------- THEIR INSTAGRAM ---------- */}
        {brand && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Their Instagram</h3>
            <p style={{ fontSize: '13px', marginBottom: '14px' }}>
              Taken from the account their site links to. This is the one step that costs a
              paid lookup.
            </p>
            {igStats ? (
              <>
                <Row label="Account" value={`@${igStats.username}`} />
                <Row label="Followers" value={compact(igStats.followers)} />
                <Row label="Posts" value={compact(igStats.total_posts)} />
                <Row label="Avg. likes" value={compact(igStats.avg_likes)} />
                <Row label="Avg. comments" value={compact(igStats.avg_comments)} />
                <Row label="Reels / video" value={igStats.video_reel_pct != null ? `${igStats.video_reel_pct}%` : '—'} />
                <Row label="Posts per week" value={igStats.posts_per_week ?? '—'} />
                <Row label="Sampled" value={`${igStats.sampled_post_count} recent posts`} />
                {/* Which backend answered. The two do not agree on every field,
                    so "the numbers changed" is easier to explain when the page
                    can say the source changed too. */}
                <Row
                  label="Source"
                  value={igStats.source === 'apify'
                    ? 'Apify — the fallback, because browse2api could not answer'
                    : 'browse2api'}
                />
              </>
            ) : (
              <Row label="Instagram" value={`Not audited — ${igError}. The deck swaps in a brand portrait rather than dropping a slide.`} missing />
            )}

            {/* Always available, not only after a failure: the site's own link
                is sometimes the parent company's account, and swapping it is a
                correction rather than a retry. */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                className="input"
                style={{ flex: '1 1 220px' }}
                placeholder="@theirhandle"
                value={igHandle}
                onChange={(e) => setIgHandle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); retryInstagram(); } }}
                disabled={retryingIg || running}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={retryInstagram}
                disabled={retryingIg || running || !igHandle.trim()}
              >
                {retryingIg ? 'Looking up…' : igStats ? 'Look up a different account' : 'Try again'}
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>costs one lookup</span>
            </div>
          </div>
        )}

        {/* ---------- OUR CONTENT ---------- */}
        {brand && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Our content about their category</h3>
            <p style={{ fontSize: '13px', marginBottom: '14px' }}>
              {matches.length
                ? 'These go on the track-record slide, each linking to the real post.'
                : 'Keep at least one, or the slide prints a placeholder line — it is part of the deck’s fixed spine, so it appears either way.'}
            </p>
            {matches.length ? (
              matches.map((m, i) => {
                // toContentMatches() takes the first three Instagram items and
                // the first two YouTube ones. Anything past that stays in the
                // list but never reaches a slide, so it says so rather than
                // looking like it made the cut.
                const before = matches.slice(0, i);
                const used = m.platform === 'youtube'
                  ? before.filter((x) => x.platform === 'youtube').length < 2
                  : before.filter((x) => x.platform !== 'youtube').length < 3;
                return (
                  <div key={m.id} style={{ display: 'flex', gap: '12px', padding: '9px 0', borderBottom: '1px solid var(--border)', alignItems: 'baseline', opacity: used ? 1 : 0.5 }}>
                    <span style={{ flex: '0 0 74px', fontSize: '12px', color: 'var(--text-muted)' }}>{m.platform}</span>
                    <span style={{ flex: 1, fontSize: '13px' }}>
                      {m.curatedBrand && <strong style={{ marginRight: '6px' }}>{m.curatedBrand} ·</strong>}
                      <a href={m.url} target="_blank" rel="noreferrer">{m.title || m.url}</a>
                      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                        {m.platform === 'youtube'
                          ? `${compact(m.views)} views`
                          : `${compact(m.likes)} likes · ${compact(m.comments)} comments`}
                        {m.curatedBrand ? ' · category pick' : m.tier === 'brand' && ' · names this brand'}
                        {!used && ' · over the slide’s limit, not printed'}
                      </span>
                    </span>
                    <button type="button" onClick={() => removeMatch(m.id)}
                      style={{ border: 0, background: 'none', padding: '2px 4px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>
                );
              })
            ) : (
              <Row label="Matches" value={matchNote || 'None'} missing />
            )}

            {/* ---- search the whole back catalogue ---- */}
            <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '14px', marginBottom: '4px' }}>Search the library</h4>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Every reel and episode in Nitin&rsquo;s archive. Plain word search over titles,
                captions and hashtags, and every word has to appear. Leave it empty for our
                best-performing content.
              </p>
              {/* Curated shelves first: a hand-picked collab beats anything a
                  word search can surface, because someone already decided it
                  was worth showing a prospect. */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                <select
                  className="input"
                  style={{ flex: '1 1 260px' }}
                  value={categoryId}
                  onChange={(e) => chooseCategory(e.target.value)}
                >
                  <option value="">No category — use the keyword match</option>
                  {CONTENT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.picks.length})</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={applyCategory}
                  disabled={!categoryId}
                >
                  Use this category
                </button>
                {categoryId && categoryId === categoryForBrand(brand)?.id && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>guessed from their site</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  className="input"
                  style={{ flex: '1 1 220px' }}
                  placeholder="perfume, jewellery, D2C…"
                  value={libQuery}
                  onChange={(e) => setLibQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchLibrary(); } }}
                />
                <select className="input" style={{ flex: '0 0 130px' }} value={libPlatform} onChange={(e) => setLibPlatform(e.target.value)}>
                  <option value="">Both</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={searchLibrary} disabled={libSearching}>
                  {libSearching ? 'Searching…' : 'Search'}
                </button>
              </div>

              {libItems && (
                <div style={{ marginTop: '14px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {libItems.length
                      ? `Showing ${libItems.length} of ${libTotal}`
                      : 'Nothing matched those words.'}
                  </p>
                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {libItems.map((item) => {
                      const already = matches.some((m) => m.id === item.id);
                      return (
                        <div key={item.id} style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'baseline' }}>
                          <span style={{ flex: '0 0 74px', fontSize: '12px', color: 'var(--text-muted)' }}>{item.platform}</span>
                          <span style={{ flex: 1, fontSize: '13px' }}>
                            {item.curatedBrand && (
                              <strong style={{ marginRight: '6px' }}>{item.curatedBrand} ·</strong>
                            )}
                            <a href={item.url} target="_blank" rel="noreferrer">{item.title || item.url}</a>
                            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                              {item.platform === 'youtube'
                                ? `${compact(item.views)} views`
                                : `${compact(item.likes)} likes · ${compact(item.comments)} comments`}
                              {item.curatedNote && ` · ${item.curatedNote}`}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => addMatch(item)}
                            disabled={already}
                          >
                            {already ? 'Added' : 'Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- OFFER + EXPORT ---------- */}
        {brand && (
          <div className="card">
            <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>What you&rsquo;re pitching</h3>
            <p style={{ fontSize: '13px', marginBottom: '12px' }}>
              Only the half being offered goes in the file.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {OFFERS.map(([value, label, slides]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOfferType(value)}
                  className={offerType === value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                >
                  {label} · {slides} slides
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={exportToSlides} disabled={Boolean(busy)}>
                {busy === 'slides' ? 'Sending…' : '📊 Export to Google Slides'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={download} disabled={Boolean(busy)}>
                {busy === 'download' ? 'Building…' : '⬇ Download .pptx'}
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{slideCount} slides</span>
            </div>

            {slidesUrl && (
              <p style={{ marginTop: '12px', fontSize: '13px' }}>
                Opened in Google Slides. <a href={slidesUrl} target="_blank" rel="noreferrer">Open it again ↗</a>
                {reportId && <> — saved to <Link href={`/report/${reportId}`}>your reports</Link>.</>}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
