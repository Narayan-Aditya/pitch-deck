'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { fetchAllUsage } from '@/lib/usage';

function relativeTime(ts) {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Mirrors INSTAGRAM_MONTHLY_LIMIT on the server. Shown, not enforced — the API
// is what actually refuses a lookup (lib/quota.js); this only draws the number.
const MONTHLY_LIMIT = 20;

export default function AdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !profile?.is_admin) return;
    let active = true;
    fetchAllUsage()
      .then(r => { if (active) setRows(r); })
      .catch(err => { if (active) setError(err.message || 'Could not load usage'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profile, authLoading]);

  if (authLoading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  // The view is security_invoker, so a non-admin querying it gets their own row
  // back rather than an error. Without this check the page would render as a
  // one-person "team" table, which looks like a bug instead of a boundary.
  if (!profile?.is_admin) {
    return (
      <div className="page" style={{ padding: '80px 0' }}>
        <div className="container" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '12px' }}>Not your page</h2>
          <p style={{ marginBottom: '20px' }}>Team usage is only visible to admins.</p>
          <Link href="/" className="btn btn-primary">← Back to my reports</Link>
        </div>
      </div>
    );
  }

  const totals = rows.reduce(
    (acc, r) => ({
      reports: acc.reports + (r.reports_created || 0),
      decks: acc.decks + (r.decks_downloaded || 0),
      slides: acc.slides + (r.slides_exported || 0),
      lookups: acc.lookups + (r.lookups_this_month || 0),
    }),
    { reports: 0, decks: 0, slides: 0, lookups: 0 }
  );

  return (
    <div className="page" style={{ padding: '48px 0' }}>
      <div className="container" style={{ maxWidth: '900px' }}>

        <div style={{ marginBottom: '28px' }}>
          <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '16px', display: 'inline-flex' }}>
            ← My reports
          </Link>
          <h1 style={{ fontSize: '28px', marginBottom: '6px' }}>Team usage</h1>
          <p style={{ fontSize: '14px' }}>
            Who is building pitch decks, and how many actually reach a client.
          </p>
        </div>

        <div className="metric-grid" style={{ marginBottom: '28px' }}>
          <div className="metric-card">
            <div className="metric-value">{rows.length}</div>
            <div className="metric-label">People signed in</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{totals.reports}</div>
            <div className="metric-label">Decks built</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{totals.decks}</div>
            <div className="metric-label">Downloaded as .pptx</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{totals.slides}</div>
            <div className="metric-label">Sent to Google Slides</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{totals.lookups}</div>
            <div className="metric-label">Paid lookups this month</div>
          </div>
        </div>

        {error && (
          <div className="card" style={{ borderColor: 'var(--error)', marginBottom: '20px' }}>
            <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xl)' }}>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Nobody has signed in yet.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Person</th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Built</th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Downloaded</th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Slides</th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Lookups</th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Last active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {r.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.avatar_url} alt="" referrerPolicy="no-referrer"
                            style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0 }} />
                        ) : (
                          <div className="history-brand-avatar" style={{ width: '30px', height: '30px', fontSize: '13px' }}>
                            {(r.full_name || r.email || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {r.full_name || '—'}
                            {r.is_admin && <span className="badge badge-accent" style={{ fontSize: '10px' }}>admin</span>}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600 }}>{r.reports_created}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600 }}>{r.decks_downloaded}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600 }}>{r.slides_exported ?? 0}</td>
                    {/* Against the monthly allowance, so a person who is out
                        of lookups reads as out rather than as merely busy. */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap',
                      color: (r.lookups_this_month || 0) >= MONTHLY_LIMIT ? 'var(--error)' : undefined }}>
                      {r.lookups_this_month || 0}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {MONTHLY_LIMIT}</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {relativeTime(r.last_activity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="form-hint" style={{ marginTop: '16px' }}>
          &ldquo;Reports&rdquo; is how many they started. &ldquo;Decks&rdquo; is how many .pptx files
          they actually downloaded — the gap between the two is work that never got sent.
          &ldquo;Slides&rdquo; is the same deck pushed straight into Google Slides instead;
          a report can be counted in both if it went out twice.
        </p>
      </div>
    </div>
  );
}
