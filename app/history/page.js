'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listReports } from '@/lib/reportStore';

// Every deck this person has made, and the way back into each one.
//
// The home page already lists reports, but as a way to resume editing — it
// links to /report/[id] and nothing else. The question this page answers is the
// other one: "I sent that brand a deck, where is it?" So the Google Slides link
// is the primary control here, and the report is the secondary one.
//
// The link lives inside report_data rather than in a column of its own, because
// it is written by the same autosave that stores everything else about a
// report. Reading it here costs nothing extra: listReports() already selects
// report_data.

function when(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const OFFER_LABEL = {
  both: 'Podcast + influencer marketing',
  podcast: 'Podcast',
  marketing: 'Influencer marketing',
};

export default function HistoryPage() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch((err) => {
        setError(err.message || 'Could not load your history.');
        setReports([]);
      });
  }, []);

  const exported = (reports || []).filter((r) => r.reportData?.slidesLink).length;

  return (
    <div className="page" style={{ padding: '32px 0 120px' }}>
      <div className="container" style={{ maxWidth: '860px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Your decks</h1>
          <Link href="/pitch-deck" className="btn btn-primary btn-sm">+ New deck</Link>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          {reports === null
            ? 'Loading…'
            : `${reports.length} report${reports.length === 1 ? '' : 's'}, ${exported} opened in Google Slides.`}
        </p>

        {error && <p className="form-error">{error}</p>}

        {reports?.length === 0 && !error && (
          <div className="card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ marginBottom: '6px' }}>Nothing here yet.</p>
            <p style={{ fontSize: '13px' }}>
              Build a deck from a prospect&rsquo;s website and it shows up here, with a link
              straight to it in Google Slides.
            </p>
          </div>
        )}

        {reports?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {reports.map((report) => {
              const rd = report.reportData || {};
              const slides = rd.slidesLink;
              return (
                <div key={report.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', flexWrap: 'wrap' }}>
                  <div className="history-brand-avatar">
                    {(report.brandName || 'B')[0].toUpperCase()}
                  </div>

                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '3px' }}>
                      {report.brandName || 'Brand Report'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {when(report.createdAt)}
                      {report.instagram && ` · ${report.instagram}`}
                      {rd.offerType && ` · ${OFFER_LABEL[rd.offerType] || rd.offerType}`}
                      {rd.brandUrl && (
                        <> · <a href={rd.brandUrl} target="_blank" rel="noreferrer">their site ↗</a></>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {slides ? (
                      <a className="btn btn-primary btn-sm" href={slides} target="_blank" rel="noreferrer">
                        Open in Slides ↗
                      </a>
                    ) : (
                      // Worth keeping visible rather than hiding: the report
                      // exists, so the work was done and possibly a lookup
                      // spent. "Never exported" is the useful thing to say.
                      <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Never exported
                      </span>
                    )}
                    <Link className="btn btn-secondary btn-sm" href={`/report/${report.id}`}>
                      Edit
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
