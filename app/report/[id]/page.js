'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { extractHandle } from '@/lib/instagramHandle';
import { getReport, updateReport } from '@/lib/reportStore';
import { buildPitchDeckPptx } from '@/lib/buildPptx';
import { logDeckEvent, DECK_DOWNLOADED, SLIDES_EXPORTED } from '@/lib/usage';
import { useAuth, getDriveToken, forgetDriveToken } from '@/lib/AuthContext';
import { uploadPptxAsGoogleSlides, DriveAuthError } from '@/lib/googleSlides';
import { CREATOR_IG_COLLABS, CREATOR_YT_BRAND_EPISODES, CREATOR_COLLAB_DEFAULTS } from '@/lib/creatorStats';
import { DECK_STYLES, STYLE_KEYS, DEFAULT_STYLE } from '@/lib/deckStyles';

// Only used for the small preview images in this editor — the deck itself
// carries no thumbnails. Hand-added entries have a synthetic id, so the real
// video id has to come out of the pasted url.
function youtubeIdFrom(url) {
  const m = String(url || '').match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : null;
}

const EMPTY_NEXT_STEP = {
  headline: 'A 20-minute call to lock your episode date.',
  bookingLink: '', email: '', phone: '', scarcity: '',
};
const EMPTY_ABOUT = { tagline: '', description: '', industry: '', foundedYear: '', headquarters: '' };
const EMPTY_IG = {
  handle: '', followers: '', totalPosts: '', avgLikes: '', avgComments: '',
  postingFrequencyPerWeek: '', videoReelPct: '',
};

// The brand-collab slide starts from our best-performing collaborations rather
// than from nothing, because "which three brands" is a question with a good
// default answer and a bad blank form. Cloned, not shared: these objects go
// into report state and get edited per report.
const EMPTY_BRAND_COLLABS = { instagram: [], youtube: [] };
function seedBrandCollabs() {
  return {
    instagram: CREATOR_COLLAB_DEFAULTS.instagram.map(c => ({ ...c })),
    youtube: CREATOR_COLLAB_DEFAULTS.youtube.map(c => ({ ...c })),
  };
}

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function computeEngagementRatePct(followers, avgLikes, avgComments) {
  if (!followers) return 0;
  return Math.round(((avgLikes + avgComments) / followers) * 10000) / 100;
}

// Small status pill used on each step so a non-technical user can see at a
// glance what still needs them, without reading any of the fields.
function StepBadge({ state }) {
  const map = {
    working: { text: 'Working…', bg: 'var(--info-soft)', fg: 'var(--info)' },
    done: { text: '✓ Done', bg: 'var(--success-soft)', fg: 'var(--success)' },
    needs: { text: 'Needs you', bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  };
  const s = map[state] || map.needs;
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>{s.text}</span>
  );
}

// The auto-generating steps stay collapsed so the page reads as a short
// checklist rather than a wall of forms. They open on demand — and open
// themselves when generation fails, which is exactly when someone needs to
// see the fields to fill them in by hand.
function StepCard({ n, title, subtitle, state, children, action, collapsible, open, onToggle, error }) {
  const isOpen = collapsible ? open : true;
  const badgeState = error ? 'needs' : state;

  return (
    <div className="card" style={{ marginBottom: '20px', borderColor: error ? 'var(--error)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: isOpen && children ? '18px' : 0 }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
          background: error ? 'var(--error)' : badgeState === 'done' ? 'var(--success)' : 'var(--accent)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: '700', fontSize: '14px', fontFamily: 'Poppins, sans-serif',
        }}>{badgeState === 'done' && !error ? '✓' : n}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {collapsible ? (
              <button
                onClick={onToggle}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  font: 'inherit', display: 'flex', alignItems: 'center', gap: '8px',
                }}
                aria-expanded={isOpen}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                <h3 style={{ fontSize: '17px', margin: 0 }}>{title}</h3>
              </button>
            ) : (
              <h3 style={{ fontSize: '17px', margin: 0 }}>{title}</h3>
            )}
            <StepBadge state={badgeState} />
            {isOpen && action}
          </div>

          {error ? (
            <p style={{ fontSize: '13px', margin: '6px 0 0', color: 'var(--error)' }}>
              Couldn&apos;t do this automatically: {error} — fill it in below.
            </p>
          ) : (
            subtitle && <p style={{ fontSize: '13px', margin: '4px 0 0' }}>{subtitle}</p>
          )}

          {collapsible && !isOpen && (
            <button
              onClick={onToggle}
              style={{ background: 'none', border: 'none', padding: '6px 0 0', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', fontWeight: 600 }}
            >
              Open to check or edit
            </button>
          )}
        </div>
      </div>
      {isOpen && children}
    </div>
  );
}

// One editable brand collaboration. The metrics are shown but not editable:
// they came off the real post, and letting someone retype "1,49,829 likes"
// into a client-facing deck is how a number nobody can defend gets in.
function CollabRow({ platform, entry, onChange, onRemove }) {
  const isYouTube = platform === 'youtube';
  const thumbId = isYouTube ? (youtubeIdFrom(entry.url) || entry.id) : null;
  const metric = isYouTube
    ? [entry.views != null ? `${Number(entry.views).toLocaleString()} views` : null, entry.durationLabel]
        .filter(Boolean).join(' · ')
    // Instagram publishes no view count — likes and comments are all there is.
    : [entry.likes != null ? `${Number(entry.likes).toLocaleString()} likes` : null,
       entry.comments != null ? `${Number(entry.comments).toLocaleString()} comments` : null]
        .filter(Boolean).join(' · ');

  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px',
    }}>
      {thumbId ? (
        <img
          src={`https://i.ytimg.com/vi/${thumbId}/mqdefault.jpg`}
          alt=""
          style={{ width: '108px', height: '61px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: '108px', height: '61px', borderRadius: '4px', flexShrink: 0,
          background: 'var(--text-primary)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
        }}>▶</div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '10px' }}>
            {isYouTube ? 'YouTube' : 'Instagram'}
          </span>
          {entry.sponsored && (
            <span className="badge badge-accent" style={{ fontSize: '10px' }}>Paid partnership</span>
          )}
          {metric && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{metric}</span>}
          {entry.url && <a href={entry.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>Open ↗</a>}
        </div>

        <input
          className="form-input" style={{ fontSize: '13px', padding: '7px 10px', fontWeight: 600 }}
          value={entry.brand || ''} placeholder="Brand name (the big text on the slide)"
          onChange={e => onChange('brand', e.target.value)}
        />
        <input
          className="form-input" style={{ fontSize: '12px', padding: '7px 10px' }}
          value={entry.url || ''} placeholder="Link to the post or video"
          onChange={e => onChange('url', e.target.value)}
        />
      </div>

      <button
        className="btn btn-ghost btn-sm"
        style={{ color: 'var(--error)', flexShrink: 0 }}
        title="Remove from the deck"
        onClick={onRemove}
      >🗑</button>
    </div>
  );
}

// Picker for swapping in a different collaboration without leaving the page.
function CollabPicker({ label, options, disabled, onPick }) {
  if (!options.length) return null;
  return (
    <select
      className="form-select"
      style={{ fontSize: '12px', padding: '7px 10px' }}
      value=""
      disabled={disabled}
      onChange={e => {
        const picked = options.find(o => o.url === e.target.value);
        if (picked) onPick(picked);
        e.target.value = '';
      }}
    >
      <option value="">{disabled ? 'Remove one first to add another' : label}</option>
      {options.map(o => (
        <option key={o.url} value={o.url}>
          {o.brand} — {(o.views ?? o.likes ?? 0).toLocaleString()} {o.views != null ? 'views' : 'likes'}
        </option>
      ))}
    </select>
  );
}

// Search the creator's own back catalogue and drop a video straight onto the
// slide. The automatic search above already guesses at relevance; this is for
// when the salesperson knows exactly which reel they want and would otherwise
// have to go find its url on Instagram and paste it in by hand.
const LIBRARY_PAGE = 24;
const LIBRARY_DEBOUNCE_MS = 300;
const MAX_MATCHES = 3;   // the creator-content slide holds three cards

function CreatorLibraryPicker({ taken, atCapacity, onAdd }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // The empty-query case is the initial "best performing" list, and waiting
    // 300ms to show it would just look slow.
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/creator-library?q=${encodeURIComponent(query)}&limit=${LIBRARY_PAGE}`)
        .then(res => res.json())
        .then(data => {
          if (cancelled) return;
          if (!data.success) throw new Error(data.error || 'Search failed');
          setItems(data.items || []);
          setTotal(data.total || 0);
          setError('');
        })
        .catch(err => {
          if (cancelled) return;
          setItems([]);
          setError(err.message || 'Could not reach the library');
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, query ? LIBRARY_DEBOUNCE_MS : 0);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: '14px', paddingTop: '14px' }}>
      <input
        className="form-input"
        style={{ fontSize: '13px', padding: '8px 11px' }}
        value={query}
        placeholder="Search our videos and reels — try “diamond”, “chai”, “funding”…"
        onChange={e => setQuery(e.target.value)}
      />

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 10px' }}>
        {error ? <span style={{ color: 'var(--error)' }}>{error}</span>
          : loading ? 'Searching…'
          : query ? `${total} match${total === 1 ? '' : 'es'}${total > items.length ? ` — showing the top ${items.length}` : ''}`
          : 'Our best-performing content. Type to search the rest.'}
      </p>

      {!loading && !error && !items.length && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Nothing matched that. Try one word instead of several — every word has to appear in the post.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
        {items.map(item => {
          const isYouTube = item.platform === 'youtube';
          const already = taken.has(item.url);
          const metric = isYouTube
            ? (item.views != null ? `${item.views.toLocaleString()} views` : '')
            // Instagram publishes no view count — likes are all there is.
            : (item.likes != null ? `${item.likes.toLocaleString()} likes` : '');

          return (
            <div key={`${item.platform}-${item.id}`} style={{
              display: 'flex', gap: '10px', alignItems: 'center',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px',
              opacity: already ? 0.55 : 1,
            }}>
              {isYouTube ? (
                <img
                  src={`https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`}
                  alt=""
                  style={{ width: '80px', height: '45px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: '80px', height: '45px', borderRadius: '3px', flexShrink: 0,
                  background: 'var(--text-primary)', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                }}>▶</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2px' }}>
                  <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '10px' }}>
                    {isYouTube ? 'YouTube' : 'Instagram'}
                  </span>
                  {metric && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{metric}</span>}
                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px' }}>Open ↗</a>
                </div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.35 }}>{item.title}</div>
              </div>

              <button
                className="btn btn-ghost btn-sm"
                style={{ flexShrink: 0 }}
                disabled={already || atCapacity}
                title={already ? 'Already on the slide' : atCapacity ? 'The slide holds three' : 'Add to the slide'}
                onClick={() => onAdd(item)}
              >
                {already ? '✓ Added' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A miniature of what the style actually produces — header bar, headline,
// subtitle, accent rule — drawn from the same tokens buildPptx.js paints with.
// Colour swatches alone don't tell you that Minimal has no header bar or that
// Bold's is a thick block.
function StyleThumb({ style }) {
  const bar = Math.round(style.headerBarH * 26);   // 0.07in→2px, 0.30in→8px
  return (
    <div style={{
      background: `#${style.bg}`, border: '1px solid var(--border)',
      borderRadius: '3px', overflow: 'hidden', width: '100%', height: '54px',
    }}>
      {bar > 0 && <div style={{ height: `${bar}px`, background: `#${style.accent}` }} />}
      <div style={{ padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ width: '70%', height: '7px', background: `#${style.textMain}`, borderRadius: '1px' }} />
        <div style={{ width: '45%', height: '4px', background: `#${style.textMuted}`, borderRadius: '1px' }} />
        <div style={{ width: '22px', height: '4px', background: `#${style.brandColor}`, borderRadius: '1px' }} />
      </div>
    </div>
  );
}

function StylePicker({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
      {STYLE_KEYS.map(key => {
        const style = DECK_STYLES[key];
        const selected = key === value;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            aria-pressed={selected}
            style={{
              textAlign: 'left', cursor: 'pointer', padding: '8px',
              background: selected ? 'var(--accent-soft, var(--bg-secondary))' : 'transparent',
              border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)', font: 'inherit',
            }}
          >
            <StyleThumb style={style} />
            <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '8px' }}>
              {selected ? '✓ ' : ''}{style.label}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.35, marginTop: '2px' }}>
              {style.blurb}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const { connectDrive } = useAuth();

  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState('');
  const [exportingPitch, setExportingPitch] = useState(false);
  const [exportingSlides, setExportingSlides] = useState(false);
  const [slidesLink, setSlidesLink] = useState('');
  const [needsDrive, setNeedsDrive] = useState(false);
  const [toast, setToast] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved

  const [about, setAbout] = useState(EMPTY_ABOUT);
  const [ig, setIg] = useState(EMPTY_IG);
  const [instagramInsight, setInstagramInsight] = useState('');
  const [audienceFit, setAudienceFit] = useState('');
  const [creatorMatches, setCreatorMatches] = useState([]);
  const [brandCollabs, setBrandCollabs] = useState(EMPTY_BRAND_COLLABS);
  const [deckStyle, setDeckStyle] = useState(DEFAULT_STYLE);
  // Instagram bio/category — grounds the brand summary so it doesn't need a
  // paid web search. `profileResolved` gates the auto-generate below: firing
  // the overview before this lands would waste the grounding entirely.
  const [igProfile, setIgProfile] = useState(null);
  const [profileResolved, setProfileResolved] = useState(false);
  // Whether the cheap local stats.json lookup has answered yet. The live
  // scrape waits on it, so a handle already sitting in that file never costs
  // a request against the Instagram session.
  const [statsChecked, setStatsChecked] = useState(false);
  const [nextStep, setNextStep] = useState(EMPTY_NEXT_STEP);

  const [fetchingIg, setFetchingIg] = useState(false);
  const [generatingOverview, setGeneratingOverview] = useState(false);
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [generatingFit, setGeneratingFit] = useState(false);
  const [findingMatches, setFindingMatches] = useState(false);
  const [browsingLibrary, setBrowsingLibrary] = useState(false);
  const [matchNote, setMatchNote] = useState('');
  const [igNote, setIgNote] = useState('');

  // Collapsed by default; a failure force-opens its own step so the manual
  // fields are right there instead of behind another click.
  const [expanded, setExpanded] = useState({});
  const [stepErrors, setStepErrors] = useState({});
  const toggleStep = (k) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  const failStep = (k, message) => {
    setStepErrors(p => ({ ...p, [k]: message }));
    setExpanded(p => ({ ...p, [k]: true }));
  };
  const clearStep = (k) => setStepErrors(p => (p[k] ? { ...p, [k]: null } : p));

  const autoStatsTried = useRef(false);
  const autoIgFetchTried = useRef(false);
  const autoOverviewTried = useRef(false);
  const autoInsightTried = useRef(false);
  const autoFitTried = useRef(false);
  const autoMatchesTried = useRef(false);
  const hydrated = useRef(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    getReport(params.id).then(found => {
      if (!found) {
        setReportError('Report not found.');
        return;
      }
      setReport(found);
      const rd = found.reportData || {};
      setAbout({ ...EMPTY_ABOUT, ...rd.about });
      setInstagramInsight(rd.instagramInsight || '');
      setAudienceFit(rd.audienceFit || '');
      setCreatorMatches(rd.creatorMatches || []);
      // Seed only when the report has never had this field. An existing but
      // empty value means someone cleared the slide on purpose, and putting
      // the defaults back would undo that on every reload.
      setBrandCollabs(rd.brandCollabs
        ? { ...EMPTY_BRAND_COLLABS, ...rd.brandCollabs }
        : seedBrandCollabs());
      // Reports made before styles existed have no key, and classic is what
      // they were built in.
      setDeckStyle(DECK_STYLES[rd.deckStyle] ? rd.deckStyle : DEFAULT_STYLE);
      setSlidesLink(rd.slidesLink || '');
      if (rd.igProfile) setIgProfile(rd.igProfile);
      setNextStep({ ...EMPTY_NEXT_STEP, ...rd.nextStep });
      const savedIg = rd.instagramAnalytics || {};
      const videoPct = savedIg.contentMix?.find(c => c.type === 'Video/Reel')?.percentage;
      setIg({
        handle: savedIg.handle || extractHandle(found.instagram),
        followers: savedIg.followers || '',
        totalPosts: savedIg.totalPosts || '',
        avgLikes: savedIg.avgLikes || '',
        avgComments: savedIg.avgComments || '',
        postingFrequencyPerWeek: savedIg.postingFrequencyPerWeek || '',
        videoReelPct: videoPct ?? '',
      });
      hydrated.current = true;
    }).catch(err => setReportError(err.message || 'Could not load report'));
  }, [params.id]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const buildReportData = () => {
    const followers = toNum(ig.followers);
    const avgLikes = toNum(ig.avgLikes);
    const avgComments = toNum(ig.avgComments);
    const videoReelPct = Math.min(Math.max(toNum(ig.videoReelPct), 0), 100);
    return {
      brandName: report.brandName,
      generatedAt: report.reportData?.generatedAt || null,
      about,
      instagramInsight,
      audienceFit,
      creatorMatches,
      brandCollabs,
      deckStyle,
      slidesLink,
      nextStep,
      igProfile,
      instagramAnalytics: {
        handle: ig.handle || extractHandle(report.instagram),
        followers,
        totalPosts: toNum(ig.totalPosts),
        avgLikes,
        avgComments,
        engagementRatePct: computeEngagementRatePct(followers, avgLikes, avgComments),
        postingFrequencyPerWeek: toNum(ig.postingFrequencyPerWeek),
        contentMix: [
          { type: 'Photo', percentage: Math.round((100 - videoReelPct) * 10) / 10 },
          { type: 'Video/Reel', percentage: Math.round(videoReelPct * 10) / 10 },
        ],
      },
    };
  };

  // Autosave — a "Save" button is one more thing to forget, and losing typed
  // work is the worst possible outcome here. Debounced so we're not writing
  // on every keystroke.
  useEffect(() => {
    if (!report || !hydrated.current) return;
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const reportData = buildReportData();
        await updateReport(report.id, { reportData });
        setReport(prev => ({ ...prev, reportData }));
        setSaveState('saved');
      } catch {
        setSaveState('idle');
      }
    }, 900);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [about, ig, instagramInsight, audienceFit, creatorMatches, brandCollabs, deckStyle, slidesLink, nextStep, igProfile]);

  // ---------- auto-fill Instagram numbers from a previous scrape ----------
  useEffect(() => {
    if (!report || autoStatsTried.current) return;
    const handle = (ig.handle || extractHandle(report.instagram) || '').replace(/^@/, '');
    if (!handle) return;
    autoStatsTried.current = true;

    fetch(`/api/ig-stats?handle=${encodeURIComponent(handle)}`)
      .then(res => res.json())
      .then(data => {
        // A miss is the normal case — stats.json is scraper output and is kept
        // off the deploy entirely. Don't resolve the profile here; the live
        // fetch below is what will answer, and letting the overview generate
        // now would throw away the bio grounding it is waiting for.
        if (!data.success || !data.stats) { setStatsChecked(true); return; }
        const s = data.stats;
        if (s.biography || s.ig_category || s.external_url) {
          setIgProfile({ biography: s.biography || '', ig_category: s.ig_category || '', external_url: s.external_url || '' });
        }
        setProfileResolved(true);
        setIg(prev => ({
          ...prev,
          followers: prev.followers === '' || prev.followers === 0 ? (s.followers ?? prev.followers) : prev.followers,
          totalPosts: prev.totalPosts === '' || prev.totalPosts === 0 ? (s.total_posts ?? prev.totalPosts) : prev.totalPosts,
          avgLikes: prev.avgLikes === '' || prev.avgLikes === 0 ? (s.avg_likes ?? prev.avgLikes) : prev.avgLikes,
          avgComments: prev.avgComments === '' || prev.avgComments === 0 ? (s.avg_comments ?? prev.avgComments) : prev.avgComments,
          videoReelPct: prev.videoReelPct === '' || prev.videoReelPct === 0 ? (s.video_reel_pct ?? prev.videoReelPct) : prev.videoReelPct,
          postingFrequencyPerWeek: prev.postingFrequencyPerWeek === '' || prev.postingFrequencyPerWeek === 0
            ? (s.posts_per_week ?? prev.postingFrequencyPerWeek) : prev.postingFrequencyPerWeek,
        }));
        setIgNote(`Using numbers collected ${s.scraped_at ? new Date(s.scraped_at).toLocaleString('en-IN') : 'earlier'}.`);
        setStatsChecked(true);
      })
      .catch(() => setStatsChecked(true));
  }, [report, ig.handle]);

  // `silent` marks the automatic attempt on first open. It differs from a
  // button press in how it reports failure: no toast, and no red error card —
  // nobody asked for this fetch, so it should not look like something the user
  // broke. The note and the "↻ Get latest" button carry the retry.
  const handleFetchInstagramData = async ({ silent = false } = {}) => {
    const handle = (ig.handle || extractHandle(report.instagram) || '').replace(/^@/, '').trim();
    if (!handle) {
      if (!silent) showToast('⚠️ Enter an Instagram handle first.', 'error');
      setProfileResolved(true);
      return;
    }
    setFetchingIg(true);
    setIgNote(silent
      ? `Getting @${handle}'s numbers — takes about 20 seconds…`
      : `Getting @${handle}'s latest numbers — takes about 20 seconds…`);
    try {
      const res = await fetch('/api/ig-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Fetch failed');
      const s = data.stats;
      setIg(prev => ({
        ...prev,
        followers: s.followers ?? prev.followers,
        totalPosts: s.total_posts ?? prev.totalPosts,
        avgLikes: s.avg_likes ?? prev.avgLikes,
        avgComments: s.avg_comments ?? prev.avgComments,
        videoReelPct: s.video_reel_pct ?? prev.videoReelPct,
        postingFrequencyPerWeek: s.posts_per_week ?? prev.postingFrequencyPerWeek,
      }));
      if (s.biography || s.ig_category || s.external_url) {
        setIgProfile({ biography: s.biography || '', ig_category: s.ig_category || '', external_url: s.external_url || '' });
      }
      setProfileResolved(true);
      setIgNote(`Fresh numbers, just collected — based on their ${s.sampled_post_count ?? 12} most recent posts.`);
      // A retry that worked should clear the failure the earlier attempt left
      // on the card, rather than leaving it contradicting the numbers above it.
      clearStep('ig');
      if (!silent) showToast(`✅ Got @${s.username}'s numbers`);
    } catch (err) {
      // Resolve either way: the brand summary is gated on this, and a failed
      // Instagram lookup should not leave the rest of the page waiting forever.
      setProfileResolved(true);
      if (silent) {
        setIgNote(`Couldn't get these automatically (${err.message}). Type them in below, or press “↻ Get latest” to try again.`);
      } else {
        setIgNote('');
        failStep('ig', err.message || 'could not reach that profile');
      }
    } finally {
      setFetchingIg(false);
    }
  };

  // ---------- fetch the Instagram numbers on first open ----------
  // Previously nothing ever triggered the live scrape, so every report opened
  // with zeros until someone noticed the "↻ Get latest" button. This fires it
  // once, and ONLY when the report has no numbers yet: re-opening a saved
  // report costs nothing. That restraint is deliberate — each lookup spends
  // four requests against a real logged-in Instagram account, which is why
  // lib/instagramScrape.js carries a throttle circuit-breaker.
  useEffect(() => {
    if (!report || autoIgFetchTried.current) return;
    if (!statsChecked) return;      // let the free local lookup answer first
    if (profileResolved) return;    // stats.json had this handle after all
    autoIgFetchTried.current = true;

    if (toNum(ig.followers)) {      // saved report — numbers are already in hand
      setProfileResolved(true);
      return;
    }
    handleFetchInstagramData({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, statsChecked, profileResolved]);

  // ---------- AI generation ----------
  const handleGenerateOverview = async () => {
    setGeneratingOverview(true);
    try {
      const res = await fetch('/api/generate-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: report.brandName, instagram: report.instagram, profile: igProfile }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setAbout(prev => ({ ...prev, ...data.about }));
      clearStep('about');
    } catch (err) {
      failStep('about', err.message || 'the lookup failed');
    } finally {
      setGeneratingOverview(false);
    }
  };

  const handleGenerateInsight = async () => {
    setGeneratingInsight(true);
    try {
      const { instagramAnalytics } = buildReportData();
      const res = await fetch('/api/generate-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: report.brandName, analytics: instagramAnalytics }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setInstagramInsight(data.insight);
      clearStep('insight');
    } catch (err) {
      failStep('insight', err.message || 'the write-up failed');
    } finally {
      setGeneratingInsight(false);
    }
  };

  const handleGenerateFit = async () => {
    setGeneratingFit(true);
    try {
      const { instagramAnalytics } = buildReportData();
      const res = await fetch('/api/generate-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: report.brandName, about, analytics: instagramAnalytics }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setAudienceFit(data.audienceFit);
      clearStep('fit');
    } catch (err) {
      failStep('fit', err.message || 'the write-up failed');
    } finally {
      setGeneratingFit(false);
    }
  };

  const handleFindCreatorMatches = async () => {
    setFindingMatches(true);
    setMatchNote('');
    try {
      const res = await fetch('/api/creator-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: report.brandName, about, limit: 3 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Search failed');
      setCreatorMatches(data.matches || []);
      if (!data.matches?.length) {
        setMatchNote(
          data.reason === 'no-creator-data'
            ? "No creator content library found on the server."
            : "Nothing in our library is close enough to this brand's category — this slide will be left out."
        );
      }
      clearStep('matches');
    } catch (err) {
      setMatchNote('');
      failStep('matches', err.message || 'the search failed');
    } finally {
      setFindingMatches(false);
    }
  };

  // Fallback for when the automatic search finds nothing relevant, or the
  // right video simply isn't in the scraped library — the salesperson can
  // still put a video on the slide by hand.
  const handleAddManualMatch = () => {
    setCreatorMatches(prev => [...prev, {
      id: `manual_${Date.now()}`,
      manual: true,
      platform: 'youtube',
      url: '',
      title: '',
      reason: '',
      tier: 'topical',
      relevance: 'direct',
    }]);
    setMatchNote('');
  };

  const updateMatch = (index, field, value) => {
    setCreatorMatches(prev => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  // Picked from the library search. It already arrives in the same shape the
  // automatic search returns, so it needs no `manual` flag — the card renders
  // with its real title and thumbnail, and only the reason is left to type.
  const handleAddFromLibrary = (item) => {
    setCreatorMatches(prev => (prev.length >= MAX_MATCHES ? prev : [...prev, { ...item, reason: '' }]));
    setMatchNote('');
    clearStep('matches');
  };

  // ---------- brand collaborations ----------
  const MAX_COLLABS = 3;

  const updateCollab = (platform, index, field, value) => {
    setBrandCollabs(prev => ({
      ...prev,
      [platform]: prev[platform].map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));
  };

  const removeCollab = (platform, index) => {
    setBrandCollabs(prev => ({
      ...prev,
      [platform]: prev[platform].filter((_, i) => i !== index),
    }));
  };

  const addCollab = (platform, entry) => {
    setBrandCollabs(prev => (
      prev[platform].length >= MAX_COLLABS
        ? prev
        : { ...prev, [platform]: [...prev[platform], { ...entry }] }
    ));
  };

  // Anything already on the slide is dropped from the picker, so the same
  // collaboration can't be added twice. Matched on url — the brand name is
  // editable and several brands appear more than once in the library.
  const unusedCollabs = (platform, library) => {
    const taken = new Set(brandCollabs[platform].map(c => c.url));
    return library.filter(c => !taken.has(c.url));
  };

  useEffect(() => {
    if (!report || autoMatchesTried.current) return;
    if (creatorMatches.length) return;
    if (!about.industry && !about.description) return;
    autoMatchesTried.current = true;
    handleFindCreatorMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, about.industry, about.description]);

  useEffect(() => {
    if (!report || autoOverviewTried.current) return;
    if (about.tagline || about.description) return;
    if (!profileResolved) return;   // wait for the free grounding data first
    autoOverviewTried.current = true;
    handleGenerateOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, about.tagline, about.description, profileResolved]);

  useEffect(() => {
    if (!report || autoInsightTried.current) return;
    if (instagramInsight) return;
    if (!toNum(ig.followers)) return;
    autoInsightTried.current = true;
    handleGenerateInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, instagramInsight, ig.followers]);

  useEffect(() => {
    if (!report || autoFitTried.current) return;
    if (audienceFit) return;
    if (!about.description) return;
    autoFitTried.current = true;
    handleGenerateFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, audienceFit, about.description]);

  // ---------- export ----------
  const handleExportPitchDeck = async () => {
    setExportingPitch(true);
    try {
      const blob = await buildPitchDeckPptx(buildReportData(), report.brandName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.brandName.replace(/\s+/g, '_')}_Pitch_Deck.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      // Logged here rather than on click, so a deck that failed to build is
      // never counted as one that went to a client.
      logDeckEvent(DECK_DOWNLOADED, report.id);
      showToast('✅ Downloaded! Check your Downloads folder.');
    } catch (err) {
      showToast(`❌ ${err.message || 'Download failed. Please try again.'}`, 'error');
    } finally {
      setExportingPitch(false);
    }
  };

  // Same deck, different destination: build the .pptx exactly as the download
  // does, then hand it to Drive, which converts it to native Google Slides on
  // upload. Nothing about the file changes — this is the same converter as
  // dragging it into Drive by hand.
  const handleExportToSlides = async () => {
    setExportingSlides(true);
    try {
      const token = getDriveToken();
      if (!token) throw new DriveAuthError('no Google Drive permission yet');

      const blob = await buildPitchDeckPptx(buildReportData(), report.brandName);
      const { url } = await uploadPptxAsGoogleSlides(
        token, blob, `${report.brandName} — Open Grey Media Pitch`
      );

      // Kept on the report so the link survives a reload — otherwise the only
      // copy of it is a toast that vanishes in three seconds.
      setSlidesLink(url);
      logDeckEvent(SLIDES_EXPORTED, report.id);
      showToast('✅ Opened in Google Slides — link is on the bar below.');
      // Best effort: this runs after two awaits, so it is no longer inside the
      // click gesture and a popup blocker may eat it. The link that just landed
      // on the sticky bar is the real answer, which is what the toast points at.
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof DriveAuthError) {
        // A stale token would otherwise fail the same way forever.
        forgetDriveToken();
        setNeedsDrive(true);
        showToast('Google needs permission to save to your Drive — connect it below.', 'info');
      } else {
        showToast(`❌ ${err.message || 'Could not export to Google Slides.'}`, 'error');
      }
    } finally {
      setExportingSlides(false);
    }
  };

  // ---------- gates ----------
  if (reportError) {
    return (
      <div className="page" style={{ padding: '80px 0' }}>
        <div className="container" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '12px' }}>{reportError}</h2>
          <a href="/" className="btn btn-primary">← Back to all reports</a>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }} />
          <p>Opening your report…</p>
        </div>
      </div>
    );
  }

  const videoReelPctPreview = Math.min(Math.max(toNum(ig.videoReelPct), 0), 100);
  const engagementPreview = computeEngagementRatePct(toNum(ig.followers), toNum(ig.avgLikes), toNum(ig.avgComments));

  // Counted the same way the slide filters, so the checklist can't claim a
  // collaboration is ready when a blank name or link would drop it.
  const collabCount = [...brandCollabs.instagram, ...brandCollabs.youtube]
    .filter(c => c?.brand?.trim() && c?.url?.trim()).length;

  const aboutState = generatingOverview ? 'working' : (about.tagline && about.description) ? 'done' : 'needs';
  const igState = fetchingIg ? 'working' : toNum(ig.followers) ? 'done' : 'needs';
  const insightState = generatingInsight ? 'working' : instagramInsight ? 'done' : 'needs';
  const fitState = generatingFit ? 'working' : audienceFit ? 'done' : 'needs';

  const checklist = [
    { label: 'Brand summary written', ok: aboutState === 'done' },
    { label: 'Instagram numbers added', ok: igState === 'done' },
    { label: 'Instagram insight written', ok: insightState === 'done' },
    { label: 'Our related videos found', ok: creatorMatches.length > 0, optional: true },
    { label: 'Brands we’ve worked with', ok: collabCount > 0, optional: true },
    { label: 'Contact details on the last slide', ok: !!(nextStep.bookingLink.trim() || nextStep.email.trim() || nextStep.phone.trim()) },
  ];
  const readyCount = checklist.filter(c => c.ok).length;

  return (
    <div className="page" style={{ padding: '32px 0 140px' }}>
      <div className="container" style={{ maxWidth: '820px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
          <a href="/" className="btn btn-ghost btn-sm">← All reports</a>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved automatically' : ''}
          </span>
        </div>

        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '32px', marginBottom: '6px' }}>{report.brandName}</h1>
          <p style={{ fontSize: '14px' }}>
            {about.tagline || 'Building your pitch deck…'}
          </p>
        </div>

        <div className="card-glass" style={{ marginBottom: '28px' }}>
          <p style={{ fontSize: '13px', margin: 0 }}>
            <strong>How this works:</strong> everything below fills in by itself. Read it over, fix anything
            that looks wrong, then hit Download. Nothing to save — your changes are kept automatically.
          </p>
        </div>

        {/* ---------- STEP 1 ---------- */}
        <StepCard
          n={1}
          title="About the brand"
          collapsible
          open={!!expanded.about}
          onToggle={() => toggleStep('about')}
          error={stepErrors.about}
          subtitle="Written automatically by looking the brand up online. Check it's right — this goes in front of a client."
          state={aboutState}
          action={
            <button className="btn btn-ghost btn-sm" onClick={handleGenerateOverview} disabled={generatingOverview}>
              {generatingOverview ? <><div className="spinner" /> Writing…</> : '↻ Rewrite'}
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">One-line description (appears on the front page)</label>
              <input className="form-input" value={about.tagline}
                onChange={e => setAbout(p => ({ ...p, tagline: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Longer description</label>
              <textarea className="form-textarea" value={about.description}
                onChange={e => setAbout(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Industry</label>
                <input className="form-input" value={about.industry}
                  onChange={e => setAbout(p => ({ ...p, industry: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Year started</label>
                <input className="form-input" value={about.foundedYear}
                  onChange={e => setAbout(p => ({ ...p, foundedYear: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Head office</label>
              <input className="form-input" value={about.headquarters}
                onChange={e => setAbout(p => ({ ...p, headquarters: e.target.value }))} />
            </div>
          </div>
        </StepCard>

        {/* ---------- STEP 2 ---------- */}
        <StepCard
          n={2}
          title="Their Instagram numbers"
          collapsible
          open={!!expanded.ig}
          onToggle={() => toggleStep('ig')}
          error={stepErrors.ig}
          subtitle={igNote || "Collected straight from their Instagram profile."}
          state={igState}
          action={
            <button className="btn btn-ghost btn-sm" onClick={() => handleFetchInstagramData()} disabled={fetchingIg}>
              {fetchingIg ? <><div className="spinner" /> Getting…</> : '↻ Get latest'}
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Instagram username</label>
              <input className="form-input" value={ig.handle}
                onChange={e => setIg(p => ({ ...p, handle: e.target.value }))} />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Followers</label>
                <input type="number" className="form-input" value={ig.followers}
                  onChange={e => setIg(p => ({ ...p, followers: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Total posts</label>
                <input type="number" className="form-input" value={ig.totalPosts}
                  onChange={e => setIg(p => ({ ...p, totalPosts: e.target.value }))} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Average likes per post</label>
                <input type="number" className="form-input" value={ig.avgLikes}
                  onChange={e => setIg(p => ({ ...p, avgLikes: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Average comments per post</label>
                <input type="number" className="form-input" value={ig.avgComments}
                  onChange={e => setIg(p => ({ ...p, avgComments: e.target.value }))} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Posts per week</label>
                <input type="number" step="0.1" className="form-input" value={ig.postingFrequencyPerWeek}
                  onChange={e => setIg(p => ({ ...p, postingFrequencyPerWeek: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">How much is video/reels? (%)</label>
                <input type="number" min="0" max="100" className="form-input" value={ig.videoReelPct}
                  onChange={e => setIg(p => ({ ...p, videoReelPct: e.target.value }))} />
                <span className="form-hint">The other {Math.round((100 - videoReelPctPreview) * 10) / 10}% counts as photos</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Engagement rate: </span>
              <strong style={{ fontSize: '17px', color: 'var(--accent-dark)' }}>{engagementPreview}%</strong>
              <span className="form-hint" style={{ marginLeft: '10px' }}>Worked out for you — no need to type it</span>
            </div>
          </div>
        </StepCard>

        {/* ---------- STEP 3 ---------- */}
        <StepCard
          n={3}
          title="What their numbers mean"
          collapsible
          open={!!expanded.insight}
          onToggle={() => toggleStep('insight')}
          error={stepErrors.insight}
          subtitle="The selling paragraph on the Instagram slide. Kept under 100 words so it fits."
          state={insightState}
          action={
            <button className="btn btn-ghost btn-sm" onClick={handleGenerateInsight} disabled={generatingInsight}>
              {generatingInsight ? <><div className="spinner" /> Writing…</> : '↻ Rewrite'}
            </button>
          }
        >
          <textarea className="form-textarea" value={instagramInsight}
            placeholder="Fills in automatically once the Instagram numbers are in…"
            onChange={e => setInstagramInsight(e.target.value)} />
          {instagramInsight && (
            <span className="form-hint">{instagramInsight.split(/\s+/).filter(Boolean).length} words</span>
          )}
        </StepCard>

        {/* ---------- STEP 4 ---------- */}
        <StepCard
          n={4}
          title="Why we're a good fit for them"
          collapsible
          open={!!expanded.fit}
          onToggle={() => toggleStep('fit')}
          error={stepErrors.fit}
          subtitle="Connects your audience to their customers. Leave blank to skip this slide."
          state={fitState}
          action={
            <button className="btn btn-ghost btn-sm" onClick={handleGenerateFit} disabled={generatingFit}>
              {generatingFit ? <><div className="spinner" /> Writing…</> : '↻ Rewrite'}
            </button>
          }
        >
          <textarea className="form-textarea" value={audienceFit}
            placeholder="Fills in automatically once the brand summary is ready…"
            onChange={e => setAudienceFit(e.target.value)} />
        </StepCard>

        {/* ---------- STEP 5 ---------- */}
        <StepCard
          n={5}
          title="Our videos about their business"
          collapsible
          open={!!expanded.matches}
          onToggle={() => toggleStep('matches')}
          error={stepErrors.matches}
          subtitle={matchNote || "Picked automatically from our YouTube and Instagram. Remove any that don't fit, or browse the library below — the slide is left out if none are kept."}
          state={findingMatches ? 'working' : creatorMatches.length ? 'done' : 'needs'}
          action={
            <>
              <button className="btn btn-ghost btn-sm" onClick={handleFindCreatorMatches} disabled={findingMatches}>
                {findingMatches ? <><div className="spinner" /> Searching…</> : '↻ Search again'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setBrowsingLibrary(v => !v)}
                aria-expanded={browsingLibrary}
              >
                {browsingLibrary ? '× Close library' : '🔍 Browse our videos'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleAddManualMatch} disabled={creatorMatches.length >= MAX_MATCHES}>
                + Add by link
              </button>
            </>
          }
        >
          {creatorMatches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {creatorMatches.map((m, i) => (
                <div key={m.id} style={{
                  display: 'flex', gap: '12px', alignItems: 'flex-start',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px',
                }}>
                  {m.platform === 'youtube' && !m.manual ? (
                    <img
                      src={`https://i.ytimg.com/vi/${m.id}/mqdefault.jpg`}
                      alt=""
                      style={{ width: '108px', height: '61px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: '108px', height: '61px', borderRadius: '4px', flexShrink: 0,
                      background: 'var(--text-primary)', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                    }}>▶</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {m.manual ? (
                        <select
                          className="form-select"
                          style={{ width: 'auto', fontSize: '11px', padding: '3px 8px' }}
                          value={m.platform}
                          onChange={e => updateMatch(i, 'platform', e.target.value)}
                        >
                          <option value="youtube">YouTube</option>
                          <option value="instagram">Instagram</option>
                        </select>
                      ) : (
                        <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '10px' }}>
                          {m.platform === 'youtube' ? 'YouTube' : 'Instagram'}
                        </span>
                      )}
                      {m.tier === 'brand' && <span className="badge badge-accent" style={{ fontSize: '10px' }}>Mentions them</span>}
                      {m.manual && <span className="badge" style={{ background: 'var(--warning-soft)', color: 'var(--warning)', fontSize: '10px' }}>Added by you</span>}
                      {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>Open ↗</a>}
                    </div>

                    {m.manual ? (
                      <>
                        <input
                          className="form-input" style={{ fontSize: '12px', padding: '7px 10px' }}
                          value={m.title || ''} placeholder="Video title (shown on the slide)"
                          onChange={e => updateMatch(i, 'title', e.target.value)}
                        />
                        <input
                          className="form-input" style={{ fontSize: '12px', padding: '7px 10px' }}
                          value={m.url || ''} placeholder="Link to the video or reel"
                          onChange={e => updateMatch(i, 'url', e.target.value)}
                        />
                      </>
                    ) : (
                      <div style={{ fontSize: '13px', fontWeight: '600' }}>{m.title}</div>
                    )}

                    <input
                      className="form-input"
                      style={{ fontSize: '12px', padding: '7px 10px' }}
                      value={m.reason || ''}
                      placeholder="One line on why this is relevant (shown on the slide)"
                      onChange={e => updateMatch(i, 'reason', e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--error)', flexShrink: 0 }}
                    title="Remove from the deck"
                    onClick={() => setCreatorMatches(prev => prev.filter((_, xi) => xi !== i))}
                  >🗑</button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {findingMatches ? 'Looking through our videos and reels…' : matchNote || 'Nothing found yet.'}
            </p>
          )}

          {browsingLibrary && (
            <CreatorLibraryPicker
              taken={new Set(creatorMatches.map(m => m.url).filter(Boolean))}
              atCapacity={creatorMatches.length >= MAX_MATCHES}
              onAdd={handleAddFromLibrary}
            />
          )}
        </StepCard>

        {/* ---------- STEP 6: BRAND COLLABORATIONS ---------- */}
        <StepCard
          n={6}
          title="Brands we've worked with"
          collapsible
          open={!!expanded.collabs}
          onToggle={() => toggleStep('collabs')}
          subtitle="Pre-filled with our best-performing collaborations. Swap in ones closer to this prospect's category if you have them — the slide is left out if you clear both lists."
          state={collabCount ? 'done' : 'needs'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {[
              { platform: 'instagram', heading: 'Instagram collaborations', library: CREATOR_IG_COLLABS },
              { platform: 'youtube', heading: 'On the podcast', library: CREATOR_YT_BRAND_EPISODES },
            ].map(({ platform, heading, library }) => (
              <div key={platform}>
                <label className="form-label">{heading}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {brandCollabs[platform].map((entry, i) => (
                    // Keyed by position, not by url: the url is one of the
                    // editable fields, and keying on it would remount the row
                    // on every keystroke and throw the caret out of the input.
                    <CollabRow
                      key={`${platform}-${i}`}
                      platform={platform}
                      entry={entry}
                      onChange={(field, value) => updateCollab(platform, i, field, value)}
                      onRemove={() => removeCollab(platform, i)}
                    />
                  ))}
                  <CollabPicker
                    label={`+ Add a ${platform === 'youtube' ? 'podcast episode' : 'collaboration'} from our library`}
                    options={unusedCollabs(platform, library)}
                    disabled={brandCollabs[platform].length >= MAX_COLLABS}
                    onPick={entry => addCollab(platform, entry)}
                  />
                </div>
              </div>
            ))}
          </div>
        </StepCard>

        {/* ---------- STEP 7: CONTACT ---------- */}
        <StepCard
          n={7}
          title="How they contact you"
          subtitle="The last slide. Without this, someone who likes your pitch has no idea what to do next."
          state={(nextStep.bookingLink.trim() || nextStep.email.trim() || nextStep.phone.trim()) ? 'done' : 'needs'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">What should they do next?</label>
              <input className="form-input" value={nextStep.headline}
                onChange={e => setNextStep(p => ({ ...p, headline: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Booking link (Calendly, Google Calendar, etc.)</label>
              <input className="form-input" placeholder="https://calendly.com/..." value={nextStep.bookingLink}
                onChange={e => setNextStep(p => ({ ...p, bookingLink: e.target.value }))} />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" placeholder="you@opengrey.media" value={nextStep.email}
                  onChange={e => setNextStep(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" placeholder="+91 ..." value={nextStep.phone}
                  onChange={e => setNextStep(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Limited availability line (optional — creates urgency)</label>
              <input className="form-input" placeholder="e.g. We record 4 episodes a month. August has 2 slots left."
                value={nextStep.scarcity}
                onChange={e => setNextStep(p => ({ ...p, scarcity: e.target.value }))} />
            </div>
          </div>
        </StepCard>

        {/* ---------- DECK STYLE ---------- */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Deck style</h3>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            Same slides and the same numbers — only the colours and type change. Saved with
            this report, so you can send different prospects a different look.
          </p>
          <StylePicker value={deckStyle} onChange={setDeckStyle} />
        </div>

        {/* ---------- CHECKLIST ---------- */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Before you send this</h3>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>
            {readyCount === checklist.length
              ? 'Everything is ready. 🎉'
              : 'The deck works without these, but it sells much better with them.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {checklist.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <span style={{ color: c.ok ? 'var(--success)' : 'var(--text-muted)', fontWeight: '700' }}>
                  {c.ok ? '✓' : '○'}
                </span>
                <span style={{ color: c.ok ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1 }}>
                  {c.label}{c.optional && !c.ok ? ' (optional)' : ''}
                </span>
                {!c.ok && c.fixHref && (
                  <a href={c.fixHref} className="btn btn-ghost btn-sm">Add</a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="toast-container">
            <div className="toast" style={{
              borderColor: toast.type === 'error' ? 'var(--error)' : toast.type === 'info' ? 'var(--accent)' : 'var(--success)'
            }}>
              {toast.msg}
            </div>
          </div>
        )}
      </div>

      {/* Sticky download bar — the primary action should always be reachable
          without scrolling back up. */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
        padding: '14px 24px', zIndex: 90,
        boxShadow: '0 -2px 10px rgba(23,23,20,0.05)',
      }}>
        <div className="container" style={{
          maxWidth: '820px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: 0,
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {readyCount} of {checklist.length} ready
            <span style={{ margin: '0 8px' }}>·</span>
            {DECK_STYLES[deckStyle]?.label || 'Classic'} style
            {slidesLink && (
              <>
                <span style={{ margin: '0 8px' }}>·</span>
                <a href={slidesLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                  Open in Google Slides ↗
                </a>
              </>
            )}
          </span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {needsDrive ? (
              // Sign-in already asks for Drive, so this is the recovery path
              // rather than the normal one: anyone who signed in before the
              // scope was added, or whose hour-old token has expired.
              <button className="btn btn-ghost btn-lg" onClick={() => connectDrive(`/report/${report.id}`)}>
                🔗 Connect Google Drive
              </button>
            ) : (
              <button className="btn btn-ghost btn-lg" onClick={handleExportToSlides} disabled={exportingSlides}>
                {exportingSlides
                  ? <><div className="spinner" /> Sending…</>
                  : slidesLink ? '↻ Export to Slides again' : '📊 Export to Google Slides'}
              </button>
            )}
            <button className="btn btn-primary btn-lg" onClick={handleExportPitchDeck} disabled={exportingPitch}>
              {exportingPitch ? <><div className="spinner" /> Building…</> : '⬇️ Download PowerPoint'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
