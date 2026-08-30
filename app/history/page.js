'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { markUpdatesSeen, unwatchBrand } from '@/lib/brandWatch';

// Every brand this person has looked up, and what has happened to it since.
//
// The pitch-deck page throws a scrape away unless a deck is exported, so until
// now "we looked at this brand in March" was not recorded anywhere. It is now,
// and the trade-press archive behind /api/history is what turns a list of names
// into something worth coming back to.

const TRIGGER_LABELS = {
  funding: 'raised',
  ambassador: 'signed a face',
  agency: 'picked an agency',
  people: 'new marketing head',
  campaign: 'campaign',
};

function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeDay(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return shortDate(iso);
}

export default function HistoryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(d => (d.success ? setData(d) : setError(d.error || 'Could not load history')))
      .catch(() => setError('Could not load history.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Opening a brand is what marks its updates read. Done on the toggle rather
  // than on page load so a glance at the list does not silently clear every
  // badge on it.
  async function onOpen(brand, open) {
    if (!open || !brand.newCount) return;
    try {
      await markUpdatesSeen(brand.id);
      setData(d => ({
        ...d,
        brands: d.brands.map(b => (b.id === brand.id ? { ...b, newCount: 0 } : b)),
      }));
    } catch {
      // Losing a read-marker is not worth interrupting anyone over — the badge
      // simply reappears on the next load.
    }
  }

  async function onUnwatch(brand) {
    setBusy(brand.id);
    try {
      await unwatchBrand(brand.id);
      setData(d => ({ ...d, brands: d.brands.filter(b => b.id !== brand.id) }));
    } catch (err) {
      setError(err.message || 'Could not stop tracking that brand.');
    } finally {
      setBusy('');
    }
  }

  const brands = data?.brands || [];
  const tracked = brands.length;
  const withNews = brands.filter(b => b.updates.length).length;

  return (
    <div className="page" style={{ padding: '32px 0 120px' }}>
      <div className="container" style={{ maxWidth: '820px' }}>

        <div style={{ marginBottom: '24px' }}>
          <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '16px', display: 'inline-flex' }}>
            ← Home
          </Link>
          <h1 style={{ fontSize: '28px', marginBottom: '6px' }}>Brands you’ve looked up</h1>
          <p style={{ fontSize: '14px' }}>
            Every brand searched on the deck builder, kept with what it found — and with anything
            the trade press has said about it since.
          </p>
        </div>

        {error && (
          <div className="card" style={{ borderColor: 'var(--error)', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Zero updates has two very different causes and the page must not let
            them look alike: nothing has happened, or no archive exists to look in. */}
        {data && !data.archiveAvailable && (
          <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '16px', padding: '12px 16px' }}>
            <p style={{ fontSize: '12px', color: 'var(--warning)', margin: 0 }}>
              No SUPABASE_SERVICE_KEY on this server, so nothing is being archived — brands are
              still recorded, but updates will stay empty until it is set.
            </p>
          </div>
        )}

        {!data && !error && (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }} />
          </div>
        )}

        {data && tracked > 0 && (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
            {tracked} {tracked === 1 ? 'brand' : 'brands'} tracked · {withNews} with news so far
          </p>
        )}

        {data && tracked === 0 && (
          <div style={{ textAlign: 'center', padding: '48px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xl)' }}>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 16px', fontSize: '13px' }}>
              Nothing here yet. Every brand you look up on the deck builder lands here.
            </p>
            <Link href="/pitch-deck" className="btn btn-primary btn-sm">Look one up</Link>
          </div>
        )}

        <div style={{ display: 'grid', gap: '10px' }}>
          {brands.map(b => (
            <details
              key={b.id}
              className="card collapsible"
              onToggle={e => onOpen(b, e.currentTarget.open)}
            >
              <summary>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexWrap: 'wrap' }}>
                  {b.details.colour && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: '11px', height: '11px', borderRadius: '2px', flexShrink: 0,
                        background: b.details.colour, border: '1px solid var(--border)',
                      }}
                    />
                  )}
                  <span className="collapsible-title">{b.name}</span>
                  {b.newCount > 0 && (
                    <span className="badge badge-accent" style={{ fontSize: '10px' }}>
                      {b.newCount} new
                    </span>
                  )}
                  {b.updates.length === 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>no news yet</span>
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    looked up {relativeDay(b.lastSearched)}
                    {b.searchCount > 1 ? ` · ${b.searchCount}×` : ''}
                  </span>
                </span>
                <span className="collapsible-chevron" aria-hidden="true">▼</span>
              </summary>

              <div className="collapsible-body">
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <Link
                    href={`/pitch-deck?brand=${encodeURIComponent(b.name)}${b.siteUrl ? `&url=${encodeURIComponent(b.siteUrl)}` : ''}`}
                    className="btn btn-primary btn-sm"
                  >
                    Build a deck
                  </Link>
                  {b.siteUrl && (
                    <a href={b.siteUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                      Visit site
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onUnwatch(b)}
                    disabled={busy === b.id}
                    style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
                  >
                    {busy === b.id ? 'Removing…' : 'Stop tracking'}
                  </button>
                </div>

                {/* What the scrape found, so the brand can be recognised without
                    spending another lookup on it. */}
                <Row label="Site" value={b.siteUrl || '—'} />
                <Row label="Industry" value={b.details.industry || 'Not identified'} muted={!b.details.industry} />
                <Row label="Description" value={b.details.description || 'None found'} muted={!b.details.description} />
                <Row
                  label="Channels"
                  value={b.details.socials.length ? b.details.socials.join(', ') : 'None found'}
                  muted={!b.details.socials.length}
                />
                <Row label="First looked up" value={shortDate(b.firstSearched)} />

                <h4 style={{ fontSize: '13px', margin: '18px 0 8px' }}>
                  Since then
                </h4>
                {b.updates.length === 0 ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                    Nothing in Entrackr, afaqs! or BestMediaInfo has named this brand since it was
                    archived. Most brands never appear — the feeds cover the ones making news.
                  </p>
                ) : (
                  b.updates.map(u => (
                    <div key={u.url} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <span className="badge" style={{ fontSize: '10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {TRIGGER_LABELS[u.trigger] || u.trigger}
                      </span>
                      <span style={{ fontSize: '13px', flex: '1 1 220px' }}>
                        <a href={u.url} target="_blank" rel="noreferrer">{u.reason}</a>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {' — '}{u.source}{u.publishedAt ? `, ${relativeDay(u.publishedAt)}` : ''}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </details>
          ))}
        </div>

      </div>
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div style={{ display: 'flex', gap: '14px', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ flex: '0 0 130px', fontSize: '13px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ flex: 1, fontSize: '13px', color: muted ? 'var(--text-muted)' : 'var(--text-primary)', fontStyle: muted ? 'italic' : 'normal', wordBreak: 'break-word' }}>
        {value}
      </span>
    </div>
  );
}
