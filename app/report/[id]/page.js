'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { extractHandle } from '@/lib/instagramHandle';
import { useAuth } from '@/lib/AuthContext';
import { getReport, updateReport } from '@/lib/reportStore';
import { AUTH_ENABLED } from '@/lib/appConfig';
import { buildPitchDeckPptx } from '@/lib/buildPptx';
import { uploadPptxAsGoogleSlides } from '@/lib/googleSlides';

const EMPTY_ABOUT = { tagline: '', description: '', industry: '', foundedYear: '', headquarters: '' };
const EMPTY_IG = {
  handle: '', followers: '', totalPosts: '', avgLikes: '', avgComments: '',
  postingFrequencyPerWeek: '', videoReelPct: '',
};

function toNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Engagement rate is deterministic math, not a fact that needs looking up —
// compute it instead of asking someone to do it by hand.
function computeEngagementRatePct(followers, avgLikes, avgComments) {
  if (!followers) return 0;
  return Math.round(((avgLikes + avgComments) / followers) * 10000) / 100;
}

function toDate(ts) {
  return ts?.toDate ? ts.toDate() : new Date(ts);
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading, signIn, getFreshAccessToken } = useAuth();

  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [exportingPitch, setExportingPitch] = useState(false);
  const [savingToSlides, setSavingToSlides] = useState(false);
  const [toast, setToast] = useState(null);

  const [about, setAbout] = useState(EMPTY_ABOUT);
  const [ig, setIg] = useState(EMPTY_IG);
  const [instagramInsight, setInstagramInsight] = useState('');

  const [fetchingIg, setFetchingIg] = useState(false);
  const [generatingOverview, setGeneratingOverview] = useState(false);
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [autoStatsNote, setAutoStatsNote] = useState('');
  const autoStatsTried = useRef(false);
  const autoOverviewTried = useRef(false);
  const autoInsightTried = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return; // gated below — don't attempt a read the security rules will reject

    getReport(params.id).then(found => {
      if (!found || (AUTH_ENABLED && found.ownerId !== user.uid)) {
        setReportError('Report not found.');
        return;
      }
      setReport(found);
      const rd = found.reportData || {};
      setAbout({ ...EMPTY_ABOUT, ...rd.about });
      setInstagramInsight(rd.instagramInsight || '');
      const savedIg = rd.instagramAnalytics || {};
      const videoPct = savedIg.contentMix?.find(c => c.type === 'Video/Reel')?.percentage;
      setIg({
        handle: savedIg.handle || extractHandle(found.instagram),
        followers: savedIg.followers || '',
        totalPosts: savedIg.totalPosts || '',
        avgLikes: savedIg.avgLikes || '',
        avgComments: savedIg.avgComments || '',
        postingFrequencyPerWeek: savedIg.postingFrequencyPerWeek || '',
        videoReelPct: videoPct ?? '',
      });
    }).catch(err => setReportError(err.message || 'Could not load report'));
  }, [params.id, user, authLoading]);

  // Auto-pull this handle's numbers from ig_data.py's stats.json once the
  // report loads. Only fills fields that are still empty, so it can never
  // clobber numbers someone already typed or edited by hand.
  useEffect(() => {
    if (!report || autoStatsTried.current) return;
    const handle = (ig.handle || extractHandle(report.instagram) || '').replace(/^@/, '');
    if (!handle) return;
    autoStatsTried.current = true;

    fetch(`/api/ig-stats?handle=${encodeURIComponent(handle)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.stats) {
          if (data.reason === 'handle-not-in-file') {
            setAutoStatsNote(`No entry for @${handle} in stats.json — run ig_data.py for this handle, or enter the numbers manually.`);
          } else if (data.reason === 'no-stats-file') {
            setAutoStatsNote('No stats.json found yet — run ig_data.py, or enter the numbers manually.');
          }
          return;
        }
        const s = data.stats;
        setIg(prev => ({
          ...prev,
          followers: prev.followers === '' || prev.followers === 0 ? (s.followers ?? prev.followers) : prev.followers,
          totalPosts: prev.totalPosts === '' || prev.totalPosts === 0 ? (s.total_posts ?? prev.totalPosts) : prev.totalPosts,
          avgLikes: prev.avgLikes === '' || prev.avgLikes === 0 ? (s.avg_likes ?? prev.avgLikes) : prev.avgLikes,
          avgComments: prev.avgComments === '' || prev.avgComments === 0 ? (s.avg_comments ?? prev.avgComments) : prev.avgComments,
          videoReelPct: prev.videoReelPct === '' || prev.videoReelPct === 0 ? (s.video_reel_pct ?? prev.videoReelPct) : prev.videoReelPct,
          postingFrequencyPerWeek: prev.postingFrequencyPerWeek === '' || prev.postingFrequencyPerWeek === 0
            ? (s.posts_per_week ?? prev.postingFrequencyPerWeek)
            : prev.postingFrequencyPerWeek,
        }));
        setAutoStatsNote(`Auto-filled from ig_data.py (scraped ${s.scraped_at ? new Date(s.scraped_at).toLocaleString('en-IN') : 'recently'}).`);
      })
      .catch(() => {});
  }, [report, ig.handle]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleGenerateOverview = async () => {
    setGeneratingOverview(true);
    try {
      const res = await fetch('/api/generate-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: report.brandName, instagram: report.instagram }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setAbout(prev => ({ ...prev, ...data.about }));
      showToast('✅ Overview generated — review it before exporting.');
    } catch (err) {
      showToast(`❌ ${err.message || 'Generation failed'}`, 'error');
    } finally {
      setGeneratingOverview(false);
    }
  };

  const handleGenerateInsight = async () => {
    setGeneratingInsight(true);
    try {
      const { instagramAnalytics } = buildReportData();
      const res = await fetch('/api/generate-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: report.brandName, analytics: instagramAnalytics }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setInstagramInsight(data.insight);
      showToast('✅ Insight generated — review it before exporting.');
    } catch (err) {
      showToast(`❌ ${err.message || 'Generation failed'}`, 'error');
    } finally {
      setGeneratingInsight(false);
    }
  };

  // Auto-generate the brand overview once, on first open of a report whose
  // about-fields are still blank. The ref guard matters: each run is a paid
  // OpenAI call, so this must never re-fire on re-render, and never overwrite
  // copy that's already been written or edited.
  useEffect(() => {
    if (!report || autoOverviewTried.current) return;
    if (about.tagline || about.description) return;
    autoOverviewTried.current = true;
    handleGenerateOverview();
  }, [report, about.tagline, about.description]);

  // Same for the insight, but it can only run once the real Instagram
  // numbers exist (it's written from them), so it waits for followers to be
  // populated — usually by the stats.json auto-fill above.
  useEffect(() => {
    if (!report || autoInsightTried.current) return;
    if (instagramInsight) return;
    if (!toNum(ig.followers)) return;
    autoInsightTried.current = true;
    handleGenerateInsight();
  }, [report, instagramInsight, ig.followers]);

  const buildReportData = () => {
    const followers = toNum(ig.followers);
    const avgLikes = toNum(ig.avgLikes);
    const avgComments = toNum(ig.avgComments);
    const videoReelPct = Math.min(Math.max(toNum(ig.videoReelPct), 0), 100);
    return {
      brandName: report.brandName,
      generatedAt: report.reportData?.generatedAt || null,
      about,
      instagramInsight,
      instagramAnalytics: {
        handle: ig.handle || extractHandle(report.instagram),
        followers,
        totalPosts: toNum(ig.totalPosts),
        avgLikes,
        avgComments,
        engagementRatePct: computeEngagementRatePct(followers, avgLikes, avgComments),
        postingFrequencyPerWeek: toNum(ig.postingFrequencyPerWeek),
        contentMix: [
          { type: 'Photo', percentage: Math.round((100 - videoReelPct) * 10) / 10 },
          { type: 'Video/Reel', percentage: Math.round(videoReelPct * 10) / 10 },
        ],
      },
    };
  };

  const persist = async (reportData) => {
    await updateReport(report.id, { reportData });
    setReport(prev => ({ ...prev, reportData }));
  };

  const handleSave = async () => {
    await persist(buildReportData());
    showToast('✅ Saved!');
  };

  // Runs ig_data.py server-side for this handle and fills the fields with
  // what it scrapes. Unlike the auto-fill on load, this OVERWRITES whatever
  // is currently in the fields — it's an explicit "go get the real numbers
  // now" action, so freshly-scraped data should win.
  const handleFetchInstagramData = async () => {
    const handle = (ig.handle || extractHandle(report.instagram) || '').replace(/^@/, '').trim();
    if (!handle) {
      showToast('⚠️ Enter an Instagram handle first.', 'error');
      return;
    }
    setFetchingIg(true);
    setAutoStatsNote(`Fetching @${handle} from Instagram — this takes ~20 seconds…`);
    try {
      const res = await fetch('/api/ig-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Fetch failed');
      const s = data.stats;
      setIg(prev => ({
        ...prev,
        followers: s.followers ?? prev.followers,
        totalPosts: s.total_posts ?? prev.totalPosts,
        avgLikes: s.avg_likes ?? prev.avgLikes,
        avgComments: s.avg_comments ?? prev.avgComments,
        videoReelPct: s.video_reel_pct ?? prev.videoReelPct,
        postingFrequencyPerWeek: s.posts_per_week ?? prev.postingFrequencyPerWeek,
      }));
      setAutoStatsNote(`Fetched live from Instagram just now — based on the ${s.sampled_post_count ?? 12} most recent posts.`);
      showToast(`✅ Fetched live data for @${s.username}`);
    } catch (err) {
      setAutoStatsNote('');
      showToast(`❌ ${err.message || 'Could not fetch Instagram data'}`, 'error');
    } finally {
      setFetchingIg(false);
    }
  };

  const handleExportPitchDeck = async () => {
    setExportingPitch(true);
    const reportData = buildReportData();
    try {
      await persist(reportData);
      const blob = await buildPitchDeckPptx(reportData, report.brandName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.brandName.replace(/\s+/g, '_')}_Pitch_Deck.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✅ Pitch deck downloaded successfully!');
    } catch (err) {
      showToast(`❌ ${err.message || 'Export failed. Please try again.'}`, 'error');
    } finally {
      setExportingPitch(false);
    }
  };

  const handleSaveToSlides = async () => {
    setSavingToSlides(true);
    showToast('⏳ Uploading to Google Slides...', 'info');
    const reportData = buildReportData();
    try {
      await persist(reportData);
      const accessToken = await getFreshAccessToken();
      if (!accessToken) throw new Error('Could not get Google Drive access — please try signing in again.');
      const blob = await buildPitchDeckPptx(reportData, report.brandName);
      const link = await uploadPptxAsGoogleSlides(accessToken, blob, `${report.brandName} Pitch Deck`);
      showToast('✅ Saved to Google Slides!');
      window.open(link, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showToast(`❌ ${err.message || 'Could not save to Google Slides'}`, 'error');
    } finally {
      setSavingToSlides(false);
    }
  };

  if (authLoading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  if (AUTH_ENABLED && !user) {
    return (
      <div className="page" style={{ padding: '80px 0' }}>
        <div className="container" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '12px' }}>Sign in required</h2>
          <p style={{ marginBottom: '20px' }}>Sign in with Google to view this report.</p>
          <button className="btn btn-primary" onClick={signIn}>Sign in with Google</button>
        </div>
      </div>
    );
  }

  if (reportError) {
    return (
      <div className="page" style={{ padding: '80px 0' }}>
        <div className="container" style={{ maxWidth: '480px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '12px' }}>{reportError}</h2>
          <a href="/" className="btn btn-primary">← Back to Dashboard</a>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 16px' }} />
          <p>Loading report...</p>
        </div>
      </div>
    );
  }

  const videoReelPctPreview = Math.min(Math.max(toNum(ig.videoReelPct), 0), 100);
  const engagementPreview = computeEngagementRatePct(toNum(ig.followers), toNum(ig.avgLikes), toNum(ig.avgComments));

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'instagram', label: '📸 Instagram Analytics' },
  ];

  return (
    <div className="page" style={{ padding: '40px 0' }}>
      <div className="container">

        {/* Back + Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '12px' }}>
          <a href="/" className="btn btn-ghost btn-sm">← Dashboard</a>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={handleSave}>
              💾 Save
            </button>
            {AUTH_ENABLED && (
              <button
                className="btn btn-secondary"
                onClick={handleSaveToSlides}
                disabled={savingToSlides}
                title="Uploads the deck straight into your Google Drive as an editable Google Slides file"
              >
                {savingToSlides ? <><div className="spinner" /> Saving...</> : '📽️ Save to Google Slides'}
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleExportPitchDeck}
              disabled={exportingPitch}
            >
              {exportingPitch ? <><div className="spinner" /> Building...</> : '⬇️ Download Pitch Deck'}
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className="report-hero" style={{ marginBottom: '32px' }}>
          <div className="report-hero-badge">
            <span>📋</span> Podcast + Influencer Marketing Pitch by Open Grey
          </div>
          <h1 className="report-hero-title">
            {report.brandName}
          </h1>
          <p className="report-hero-subtitle">
            {about.tagline || 'Podcast & Influencer Marketing Opportunity'}
          </p>
          <div className="report-hero-meta">
            {about.industry && <span className="chip">🏭 {about.industry}</span>}
            {report.createdAt && (
              <span className="chip">📅 {toDate(report.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            )}
            {about.foundedYear && <span className="chip">🏁 Founded {about.foundedYear}</span>}
            {about.headquarters && <span className="chip">📍 {about.headquarters}</span>}
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '32px',
          background: 'var(--bg-secondary)',
          padding: '4px',
          borderRadius: 'var(--radius-lg)',
          flexWrap: 'wrap',
          border: '1px solid var(--border)',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className="btn btn-sm"
              style={{
                background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
                border: activeTab === tab.id ? '1px solid var(--border)' : '1px solid transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? '700' : '500',
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ======================= TAB: OVERVIEW ======================= */}
        {activeTab === 'overview' && (
          <div className="animate-fade-up">

            <div className="report-section">
              <div className="report-section-title" style={{ justifyContent: 'space-between' }}>
                <span><span className="icon">📊</span> About {report.brandName}</span>
                <button className="btn btn-secondary btn-sm" onClick={handleGenerateOverview} disabled={generatingOverview}>
                  {generatingOverview ? <><div className="spinner" /> Researching...</> : '✨ Regenerate'}
                </button>
              </div>
              <p className="form-hint" style={{ marginTop: '-8px', marginBottom: '14px' }}>
                {generatingOverview
                  ? 'Researching the brand via live web search…'
                  : 'Auto-generated on first open via live web search. It\'s told to write "Unknown" rather than guess — still read it before exporting, since this goes in front of a client.'}
              </p>
              <div className="card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div className="form-group">
                    <label className="form-label">Tagline</label>
                    <input
                      className="form-input"
                      placeholder="Short (~10-15 word) punchy positioning line — cover slide subtitle"
                      value={about.tagline}
                      onChange={e => setAbout(prev => ({ ...prev, tagline: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      placeholder="3-5 sentences on what the brand sells/does and its positioning"
                      value={about.description}
                      onChange={e => setAbout(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Industry</label>
                      <input
                        className="form-input"
                        value={about.industry}
                        onChange={e => setAbout(prev => ({ ...prev, industry: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Founded Year</label>
                      <input
                        className="form-input"
                        value={about.foundedYear}
                        onChange={e => setAbout(prev => ({ ...prev, foundedYear: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Headquarters</label>
                    <input
                      className="form-input"
                      value={about.headquarters}
                      onChange={e => setAbout(prev => ({ ...prev, headquarters: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
            </div>
          </div>
        )}

        {/* ======================= TAB: INSTAGRAM ANALYTICS ======================= */}
        {activeTab === 'instagram' && (
          <div className="animate-fade-up">
            <div className="report-section">
              <div className="report-section-title" style={{ justifyContent: 'space-between' }}>
                <span><span className="icon">📸</span> Instagram Analytics</span>
                <button className="btn btn-secondary btn-sm" onClick={handleFetchInstagramData} disabled={fetchingIg}>
                  {fetchingIg ? <><div className="spinner" /> Fetching...</> : '📸 Fetch Instagram Data'}
                </button>
              </div>
              <p className="form-hint" style={{ marginTop: '-8px', marginBottom: '14px' }}>
                {autoStatsNote || 'Scrapes this handle live via ig_data.py and overwrites the numbers below. Needs a valid IG_SESSIONID in .env.local.'}
              </p>
              <div className="card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div className="form-group">
                    <label className="form-label">Handle</label>
                    <input
                      className="form-input"
                      value={ig.handle}
                      onChange={e => setIg(prev => ({ ...prev, handle: e.target.value }))}
                    />
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Followers</label>
                      <input
                        type="number" className="form-input" value={ig.followers}
                        onChange={e => setIg(prev => ({ ...prev, followers: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Total Posts</label>
                      <input
                        type="number" className="form-input" value={ig.totalPosts}
                        onChange={e => setIg(prev => ({ ...prev, totalPosts: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Avg. Likes / Post</label>
                      <input
                        type="number" className="form-input" value={ig.avgLikes}
                        onChange={e => setIg(prev => ({ ...prev, avgLikes: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Avg. Comments / Post</label>
                      <input
                        type="number" className="form-input" value={ig.avgComments}
                        onChange={e => setIg(prev => ({ ...prev, avgComments: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Posts / Week</label>
                      <input
                        type="number" step="0.1" className="form-input" value={ig.postingFrequencyPerWeek}
                        onChange={e => setIg(prev => ({ ...prev, postingFrequencyPerWeek: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Video/Reel Mix (%)</label>
                      <input
                        type="number" min="0" max="100" className="form-input" value={ig.videoReelPct}
                        onChange={e => setIg(prev => ({ ...prev, videoReelPct: e.target.value }))}
                      />
                      <span className="form-hint">Photo mix is auto-set to the remaining {Math.round((100 - videoReelPctPreview) * 10) / 10}%</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Engagement Rate</label>
                    <div className="metric-card" style={{ textAlign: 'left', padding: '12px 16px' }}>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--accent-dark)' }}>{engagementPreview}%</span>
                      <span className="form-hint" style={{ marginLeft: '10px' }}>Auto-calculated from followers, avg likes & avg comments</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '20px' }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>What This Means (Instagram Insight)</label>
                    <button className="btn btn-secondary btn-sm" onClick={handleGenerateInsight} disabled={generatingInsight}>
                      {generatingInsight ? <><div className="spinner" /> Writing...</> : '✨ Regenerate'}
                    </button>
                  </div>
                  <span className="form-hint">
                    Auto-written from the real numbers above, capped at 100 words to fit the slide.
                    {instagramInsight ? ` (${instagramInsight.split(/\s+/).filter(Boolean).length} words)` : ''}
                  </span>
                  <textarea
                    className="form-textarea"
                    placeholder="What the numbers above mean for a podcast/influencer marketing opportunity — e.g. under-posting, engagement rate vs. benchmarks, content mix gaps"
                    value={instagramInsight}
                    onChange={e => setInstagramInsight(e.target.value)}
                  />
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="toast-container">
            <div className="toast" style={{
              borderColor: toast.type === 'error' ? 'var(--error)' : toast.type === 'info' ? 'var(--accent)' : 'var(--success)'
            }}>
              {toast.msg}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
