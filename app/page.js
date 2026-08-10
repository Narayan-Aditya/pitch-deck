'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { listReports, deleteReport } from '@/lib/reportStore';
import { AUTH_ENABLED } from '@/lib/appConfig';

export default function Dashboard() {
  const { user, loading, signIn } = useAuth();
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setReports([]);
      setReportsLoading(false);
      return;
    }
    setReportsLoading(true);
    listReports(user.uid).then(setReports).finally(() => setReportsLoading(false));
  }, [user, loading]);

  const handleDelete = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    deleteReport(id).then(() => setReports(prev => prev.filter(r => r.id !== id)));
  };

  const formatDate = (ts) => {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="page" style={{ padding: '48px 0' }}>
      <div className="container">

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '64px' }} className="animate-fade-up">
          <h1 style={{ marginBottom: '16px', lineHeight: 1.15 }}>
            Brand Pitch Report Generator
          </h1>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto 32px' }}>
            Enter a brand name and Instagram handle to generate a pitch report as an editable PowerPoint — or save it straight to Google Slides.
          </p>
          {AUTH_ENABLED && !loading && !user ? (
            <button className="btn btn-primary btn-lg" onClick={signIn}>
              Sign in with Google to get started
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/new-report" className="btn btn-primary btn-lg">
                Generate New Report
              </Link>
              {reports.length > 0 && (
                <a href="#history" className="btn btn-secondary btn-lg">
                  View History ({reports.length})
                </a>
              )}
            </div>
          )}
        </div>

        {loading || (user && reportsLoading) ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }} />
          </div>
        ) : user ? (
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
        ) : null}

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
