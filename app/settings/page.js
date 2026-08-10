'use client';

import { useState, useEffect } from 'react';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/lib/agencySettings';

export default function SettingsPage() {
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setS(loadSettings());
    setLoaded(true);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const save = () => {
    saveSettings(s);
    showToast('✅ Saved — every new report will use this.');
  };

  const setLine = (i, value) => {
    setS(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        lineItems: prev.pricing.lineItems.map((l, idx) => (idx === i ? { ...l, value } : l)),
      },
    }));
  };

  if (!loaded) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '40px 0 80px' }}>
      <div className="container" style={{ maxWidth: '760px' }}>

        <a href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '20px', display: 'inline-flex' }}>← Back</a>

        <h2 style={{ marginBottom: '8px' }}>Your Company Details</h2>
        <p style={{ marginBottom: '32px' }}>
          Fill this in <strong>once</strong>. It gets added to every pitch deck you make from now on —
          you won't be asked for it again.
        </p>

        {/* ---------- PRICING ---------- */}
        <div className="report-section">
          <div className="report-section-title"><span className="icon">💰</span> Your Pricing</div>
          <p className="form-hint" style={{ marginTop: '-8px', marginBottom: '16px' }}>
            Showing what each piece would cost separately makes your actual price look small.
            Leave this blank if you'd rather discuss price on a call — the slide is skipped automatically.
          </p>
          <div className="card">
            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>
              What it would cost them separately:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {s.pricing.lineItems.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)' }}>{l.label}</span>
                  <input className="form-input" style={{ width: '150px' }} placeholder="₹ 50,000"
                    value={l.value} onChange={e => setLine(i, e.target.value)} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Total value (all added up)</label>
                  <input className="form-input" placeholder="₹ 2,00,000" value={s.pricing.totalValue}
                    onChange={e => setS(p => ({ ...p, pricing: { ...p.pricing, totalValue: e.target.value } }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Your actual price</label>
                  <input className="form-input" placeholder="₹ 75,000" value={s.pricing.yourInvestment}
                    onChange={e => setS(p => ({ ...p, pricing: { ...p.pricing, yourInvestment: e.target.value } }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Your guarantee (optional, but this is what closes deals)</label>
                <input className="form-input"
                  placeholder="e.g. If the episode doesn't hit 500K views in 30 days, the next one is free."
                  value={s.pricing.riskReversal}
                  onChange={e => setS(p => ({ ...p, pricing: { ...p.pricing, riskReversal: e.target.value } }))} />
              </div>
            </div>
          </div>
        </div>

        {/* ---------- NEXT STEP ---------- */}
        <div className="report-section">
          <div className="report-section-title"><span className="icon">📞</span> How They Contact You</div>
          <p className="form-hint" style={{ marginTop: '-8px', marginBottom: '16px' }}>
            The last slide. Without this, someone who loves your pitch has no idea what to do next.
          </p>
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">What should they do next?</label>
                <input className="form-input" value={s.nextStep.headline}
                  onChange={e => setS(p => ({ ...p, nextStep: { ...p.nextStep, headline: e.target.value } }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Booking link (Calendly, Google Calendar, etc.)</label>
                <input className="form-input" placeholder="https://calendly.com/..." value={s.nextStep.bookingLink}
                  onChange={e => setS(p => ({ ...p, nextStep: { ...p.nextStep, bookingLink: e.target.value } }))} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" placeholder="you@opengrey.media" value={s.nextStep.email}
                    onChange={e => setS(p => ({ ...p, nextStep: { ...p.nextStep, email: e.target.value } }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" placeholder="+91 ..." value={s.nextStep.phone}
                    onChange={e => setS(p => ({ ...p, nextStep: { ...p.nextStep, phone: e.target.value } }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Limited availability line (optional — creates urgency)</label>
                <input className="form-input" placeholder="e.g. We record 4 episodes a month. March has 2 slots left."
                  value={s.nextStep.scarcity}
                  onChange={e => setS(p => ({ ...p, nextStep: { ...p.nextStep, scarcity: e.target.value } }))} />
              </div>
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" onClick={save} style={{ width: '100%' }}>
          Save Company Details
        </button>

        {toast && (
          <div className="toast-container">
            <div className="toast" style={{ borderColor: 'var(--success)' }}>{toast}</div>
          </div>
        )}

      </div>
    </div>
  );
}
