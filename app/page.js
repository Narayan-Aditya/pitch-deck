'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import {
  listReports, deleteReport, countLocalReports, importLocalReports,
} from '@/lib/reportStore';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Reports made before sign-in existed are stranded in this browser. Offer to
  // adopt them once, rather than letting them quietly disappear.
  const [strandedCount, setStrandedCount] = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    let active = true;
    listReports()
      .then(r => { if (active) setReports(r); })
      .catch(err => { if (active) setLoadError(err.message || 'Could not load your reports'); })
      .finally(() => {
        if (!active) return;
        setReportsLoading(false);
        // localStorage isn't readable during SSR, so this has to wait for the
        // client; folding it in here keeps it out of the effect body.
        setStrandedCount(countLocalReports());
      });
    return () => { active = false; };
  }, [user, authLoading]);

  const handleImport = async () => {
    setImporting(true);
    try {
      await importLocalReports();
      setStrandedCount(0);
      setReports(await listReports());
    } catch (err) {
      setLoadError(err.message || 'Could not import those reports');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    deleteReport(id).then(() => setReports(prev => prev.filter(r => r.id !== id)));
  };

  const formatDate = (ts) =>
    new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="page" style={{ padding: '48px 0' }}>
      <div className="container">

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '64px' }} className="animate-fade-up">
          <h1 style={{ marginBottom: '16px', lineHeight: 1.15 }}>
            Brand Pitch Report Generator
          </h1>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 32px' }}>
            Paste a prospect&rsquo;s website and get the deck, or fill a report in by hand.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* Primary, because it is the shorter road to the same deck: the
                website supplies the brand facts the report flow asks a person
                to type. The manual flow stays for prospects whose site gives up
                nothing useful. */}
            <Link href="/pitch-deck" className="btn btn-primary btn-lg">
              OGM Pitch Deck
            </Link>
            <Link href="/new-report" className="btn btn-secondary btn-lg">
              Report by hand
            </Link>
            {reports.length > 0 && (
              <a href="#history" className="btn btn-secondary btn-lg">
                View History ({reports.length})
              </a>
            )}
          </div>
        </div>

        {strandedCount > 0 && (
          <div className="card-glass" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '13px', margin: 0, flex: 1, minWidth: '240px' }}>
              <strong>{strandedCount} report{strandedCount === 1 ? '' : 's'} saved on this computer</strong> from
              before sign-in existed. Move {strandedCount === 1 ? 'it' : 'them'} into your account and
              {strandedCount === 1 ? ' it' : ' they'}&apos;ll show up on every device.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={handleImport} disabled={importing}>
              {importing ? <><div className="spinner" /> Moving…</> : 'Move to my account'}
            </button>
          </div>
        )}

        {loadError && (
          <div className="card" style={{ borderColor: 'var(--error)', marginBottom: '24px' }}>
            <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }}>{loadError}</p>
          </div>
        )}

        {authLoading || reportsLoading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }} />
          </div>
        ) : (
          <>
            {/* Report History */}
            {reports.length > 0 && (
              <div id="history">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '22px' }}>📁 Recent Reports</h2>
                  <span className="badge badge-accent">{reports.length} reports</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {reports.map(report => (
                    <Link key={report.id} href={`/report/${report.id}`} className="history-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                        <div className="history-brand-avatar">
                          {(report.brandName || 'B')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '4px' }}>
                            {report.brandName || 'Brand Report'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                            <span>📸 {report.instagram || '—'}</span>
                            <span>📅 {formatDate(report.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span className="badge badge-success">✓ Ready</span>
                        <button
                          onClick={(e) => handleDelete(report.id, e)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--error)' }}
                          title="Delete report"
                        >
                          🗑
                        </button>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {reports.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xl)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                <h3 style={{ marginBottom: '8px' }}>No Reports Yet</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Generate your first pitch report</p>
                <Link href="/new-report" className="btn btn-primary">Start Now</Link>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '80px', padding: '24px 0', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--accent)', fontWeight: '600' }}>Open Grey</span>
          </p>
        </div>

      </div>
    </div>
  );
}
