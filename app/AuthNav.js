'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { fetchMyUsage } from '@/lib/usage';

export default function AuthNav() {
  const { user, profile, loading, signOut } = useAuth();
  const [usage, setUsage] = useState(null);
  const pathname = usePathname();

  // Re-read on navigation rather than subscribing: the counts only change as a
  // result of something the user just did, and every one of those actions ends
  // in a page change. A realtime subscription would be a lot of machinery to
  // watch a number that moves a few times a day.
  useEffect(() => {
    // No reset branch for the signed-out case: this component renders nothing
    // without a user, and signOut() reloads the page rather than navigating,
    // so stale counts can never surface.
    if (!user) return undefined;
    let active = true;
    fetchMyUsage(user.id).then(u => { if (active) setUsage(u); });
    return () => { active = false; };
  }, [user, pathname]);

  if (loading || !user) return null;

  const name = profile?.full_name || user.email;
  const avatar = profile?.avatar_url || user.user_metadata?.avatar_url;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      {usage && (
        <span
          className="badge"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
          title="Reports you've created and decks you've downloaded"
        >
          {usage.reports_created} reports · {usage.decks_downloaded} decks
        </span>
      )}

      <Link href="/history" className="btn btn-ghost btn-sm">History</Link>

      {profile?.is_admin && (
        <Link href="/admin" className="btn btn-ghost btn-sm">Team usage</Link>
      )}

      <Link href="/pitch-deck" className="btn btn-primary btn-sm">+ New Deck</Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
    </div>
  );
}
