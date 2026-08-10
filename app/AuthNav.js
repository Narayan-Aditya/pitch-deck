'use client';

import { useAuth } from '@/lib/AuthContext';
import { AUTH_ENABLED } from '@/lib/appConfig';

export default function AuthNav() {
  const { user, loading, signIn, signOut } = useAuth();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <a href="/settings" className="btn btn-ghost btn-sm">⚙️ Company Details</a>
      <a href="/new-report" className="btn btn-primary btn-sm">
        + New Report
      </a>
      {!AUTH_ENABLED ? (
        <span className="badge badge-warning">Local mode — login off</span>
      ) : loading ? null : user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              style={{ width: '28px', height: '28px', borderRadius: '50%' }}
              referrerPolicy="no-referrer"
            />
          )}
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {user.displayName || user.email}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      ) : (
        <button className="btn btn-secondary btn-sm" onClick={signIn}>Sign in with Google</button>
      )}
    </div>
  );
}
