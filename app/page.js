'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

// One road in.
//
// This page used to list every report the signed-in person had made and offer
// two ways to start one. Both are gone: there is a single flow now, and nothing
// reads the saved reports any more — who made how many is the admin dashboard's
// question, and it answers it from the event log rather than from this list.
//
// What sits here instead is the prospect feed: Indian brands that did something
// this week worth pitching against, read off three trade-press RSS feeds.

// What each trigger means to someone about to pitch. The label is what shows on
// the chip; the order here is the order they are worth acting on.
const TRIGGER_LABELS = {
  funding: 'just raised',
  ambassador: 'signed a face',
  agency: 'picked an agency',
  people: 'new marketing head',
  campaign: 'running a campaign',
};

function relativeDay(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function HomePage() {
  const { profile } = useAuth();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/prospects')
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        if (d.success) setFeed(d);
        else setError(d.error || 'Could not read the feeds');
      })
      .catch(() => { if (active) setError('Could not reach the feeds.'); });
    return () => { active = false; };
  }, []);

  return (
    <div className="page-fixed" style={{ padding: '36px 0 0' }}>
      <div
        className="container"
        style={{ maxWidth: '820px', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
      >

        <div style={{ textAlign: 'center', flexShrink: 0 }} className="animate-fade-up">
          <h1 style={{ marginBottom: '24px', lineHeight: 1.15 }}>OGM Pitch Deck</h1>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/pitch-deck" className="btn btn-primary btn-lg">
              Build a deck
            </Link>
            <Link href="/history" className="btn btn-secondary btn-lg">
              History
            </Link>
            {profile?.is_admin && (
              <Link href="/admin" className="btn btn-secondary btn-lg">
                Team usage
              </Link>
            )}
          </div>
        </div>

        {/* Everything above the list is fixed; the list itself takes what is
            left of the screen and scrolls inside it. */}
        <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '6px', flexShrink: 0 }}>
            <h2 style={{ fontSize: '20px' }}>Worth pitching this week</h2>
            {feed && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {feed.brands.length} brands · Entrackr, afaqs!, BestMediaInfo
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', marginBottom: '16px', flexShrink: 0 }}>
            Indian brands that raised money, signed a face, hired a marketing head or put a campaign
            out. Refreshes itself every half hour.
          </p>

          {/* A feed that quietly went empty and a feed that is still loading look
              the same on screen, so each says which it is. */}
          {error && (
            <div className="card" style={{ borderColor: 'var(--error)', flexShrink: 0 }}>
              <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }}>{error}</p>
            </div>
          )}

          {!feed && !error && (
            <div style={{ textAlign: 'center', padding: '48px', flexShrink: 0 }}>
              <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }} />
            </div>
          )}

          {feed?.failed?.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--warning)', marginBottom: '14px', padding: '12px 16px', flexShrink: 0 }}>
              <p style={{ fontSize: '12px', color: 'var(--warning)', margin: 0 }}>
                {feed.failed.map(f => `${f.source} didn’t answer (${f.error})`).join(' · ')}
                {' — the rest of the feed is still current.'}
              </p>
            </div>
          )}

          {feed && feed.brands.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xl)', flexShrink: 0 }}>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13px' }}>
                Nothing pitchable in the feeds right now. It refills as the outlets publish.
              </p>
            </div>
          )}

          <div className="scroll-region" style={{ display: 'grid', gap: '10px', alignContent: 'start' }}>
            {feed?.brands.map(b => (
              <div key={b.key} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>{b.brand}</span>
                      {/* Two different kinds of signal on one brand is the
                          strongest thing this feed can tell you, so it gets said
                          out loud rather than left to be counted. */}
                      {b.signals.length > 1 && (
                        <span className="badge badge-accent" style={{ fontSize: '10px' }}>
                          {b.signals.length} signals
                        </span>
                      )}
                    </div>

                    {b.signals.map(s => (
                      <div key={s.trigger} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', marginTop: '4px' }}>
                        <span className="badge" style={{ fontSize: '10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {TRIGGER_LABELS[s.trigger] || s.trigger}
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: '1 1 220px' }}>
                          <a href={s.url} target="_blank" rel="noreferrer">{s.reason}</a>
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                            {' — '}{s.sources.join(', ')}{s.publishedAt ? `, ${relativeDay(s.publishedAt)}` : ''}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* The feed knows the brand's name but never its website, and
                      guessing a domain would point the scraper at the wrong
                      company. So this carries the name across and the deck page
                      asks for the URL. */}
                  <Link
                    href={`/pitch-deck?brand=${encodeURIComponent(b.brand)}`}
                    className="btn btn-secondary btn-sm"
                    style={{ flexShrink: 0 }}
                  >
                    Build deck
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
