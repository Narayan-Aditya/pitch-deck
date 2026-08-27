'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

function LoginCard() {
  const { signIn, loading, user } = useAuth();
  const params = useSearchParams();
  const error = params.get('error');
  // The middleware bounces a signed-in account from outside the allowlist back
  // here. Without a reason on screen that reads as the button not working, and
  // the person just presses it again.
  const denied = params.get('denied') === 'domain';
  const next = params.get('next') || '/';

  return (
    <div className="container" style={{ maxWidth: '420px', textAlign: 'center' }}>
      <div className="navbar-logo" style={{ margin: '0 auto 20px', width: '52px', height: '52px', fontSize: '20px' }}>
        OG
      </div>

      <h1 style={{ fontSize: '26px', marginBottom: '8px' }}>Open Grey Reports</h1>
      <p style={{ marginBottom: '28px' }}>
        Sign in to build pitch decks and pick up where you left off — your reports
        follow you to any device.
      </p>

      {denied && (
        <div
          className="card"
          style={{ borderColor: 'var(--error)', marginBottom: '20px', textAlign: 'left' }}
        >
          <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }}>
            That account isn&apos;t an <strong>@opengrey.media</strong> address. Sign out of
            Google, or switch accounts, and use your work one.
          </p>
        </div>
      )}

      {error && (
        <div
          className="card"
          style={{ borderColor: 'var(--error)', marginBottom: '20px', textAlign: 'left' }}
        >
          <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }}>
            Couldn&apos;t sign you in: {error}
          </p>
        </div>
      )}

      <button
        className="btn btn-primary btn-lg"
        style={{ width: '100%' }}
        onClick={() => signIn(next)}
        disabled={loading || !!user}
      >
        {loading ? <div className="spinner" /> : user ? 'Signing you in…' : 'Sign in with Google'}
      </button>

      <p className="form-hint" style={{ marginTop: '18px' }}>
        Use your Open Grey Google account.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      className="page"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}
    >
      {/* useSearchParams needs a Suspense boundary or the whole route opts out
          of static rendering and the build warns. */}
      <Suspense fallback={<div className="spinner" style={{ width: '40px', height: '40px' }} />}>
        <LoginCard />
      </Suspense>
    </div>
  );
}
