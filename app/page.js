'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

// One road in.
//
// This page used to list every report the signed-in person had made and offer
// two ways to start one. Both are gone: there is a single flow now, and nothing
// reads the saved reports any more — who made how many is the admin dashboard's
// question, and it answers it from the event log rather than from this list.

const STEPS = [
  ['Read their site', 'Brand colour, social channels and the About copy — one fetch, no typing.'],
  ['Audit their Instagram', 'The account their site links to. Cached, so the same prospect is never paid for twice.'],
  ['Pick the proof', 'Our own reels and episodes about their category, curated or searched.'],
  ['Send it', 'Straight into Google Slides, or download the .pptx.'],
];

export default function HomePage() {
  const { profile } = useAuth();

  return (
    <div className="page" style={{ padding: '48px 0' }}>
      <div className="container" style={{ maxWidth: '820px' }}>

        <div style={{ textAlign: 'center', marginBottom: '56px' }} className="animate-fade-up">
          <h1 style={{ marginBottom: '16px', lineHeight: 1.15 }}>OGM Pitch Deck</h1>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 32px' }}>
            Paste a prospect&rsquo;s website. Get an eleven-slide proposal, coloured to their brand.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/pitch-deck" className="btn btn-primary btn-lg">
              Build a deck
            </Link>
            {profile?.is_admin && (
              <Link href="/admin" className="btn btn-secondary btn-lg">
                Team usage
              </Link>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {STEPS.map(([title, detail], i) => (
            <div key={title} className="card" style={{ padding: '20px' }}>
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%', marginBottom: '10px',
                background: 'var(--accent-soft, #e6f2ec)', color: 'var(--accent, #1b6b4a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700,
              }}>
                {i + 1}
              </div>
              <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{title}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55 }}>{detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
