'use client';

import { useAuth } from '@/lib/AuthContext';

export default function AuthNav() {
  const { user, profile, loading, signOut } = useAuth();

  if (loading || !user) return null;

  const name = profile?.full_name || user.email;
  const avatar = profile?.avatar_url || user.user_metadata?.avatar_url;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      {avatar && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          style={{ width: '28px', height: '28px', borderRadius: '50%' }}
          referrerPolicy="no-referrer"
        />
      )}
      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{name}</span>
      <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
    </div>
  );
}
