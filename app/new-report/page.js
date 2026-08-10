'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { extractHandle } from '@/lib/instagramHandle';
import { createReport } from '@/lib/reportStore';
import { logDeckEvent, REPORT_CREATED } from '@/lib/usage';

const initialForm = {
  brandName: '',
  instagram: '',
};

export default function NewReport() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.brandName.trim()) e.brandName = 'Brand name is required';
    if (!form.instagram.trim()) e.instagram = 'Instagram handle or profile link is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Nothing to fetch anymore — all brand facts and Instagram numbers are
  // filled in by hand on the report page — so the report can be created
  // instantly instead of going through an async "generating" step.
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const reportData = {
        brandName: form.brandName,
        generatedAt: new Date().toISOString(),
        about: { tagline: '', description: '', industry: '', foundedYear: '', headquarters: '' },
        instagramInsight: '',
        instagramAnalytics: {
          handle: extractHandle(form.instagram),
          followers: 0,
          totalPosts: 0,
          avgLikes: 0,
          avgComments: 0,
          engagementRatePct: 0,
          postingFrequencyPerWeek: 0,
          contentMix: [
            { type: 'Photo', percentage: 100 },
            { type: 'Video/Reel', percentage: 0 },
          ],
        },
      };

      const id = await createReport({
        brandName: form.brandName,
        instagram: form.instagram,
        reportData,
      });
      // Not awaited: the report exists, so the navigation shouldn't wait on a
      // stats row. logDeckEvent swallows its own failures.
      logDeckEvent(REPORT_CREATED, id);
      router.push(`/report/${id}`);
    } catch (err) {
      setErrors({ brandName: err.message || 'Could not create report' });
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ padding: '48px 0' }}>
      <div className="container" style={{ maxWidth: '600px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <a href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '20px', display: 'inline-flex' }}>
            ← Back
          </a>
          <h2 style={{ marginBottom: '8px' }}>New Pitch Report</h2>
          <p>Enter a brand name and Instagram handle — you'll fill in the brand facts and Instagram numbers on the next page.</p>
        </div>

        {/* Form Card */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group">
              <label className="form-label">Brand Name <span>*</span></label>
              <input
                className="form-input"
                placeholder="e.g. Ok Dada, Boba Bhai, My Brand"
                value={form.brandName}
                onChange={e => update('brandName', e.target.value)}
              />
              {errors.brandName && <span style={{ color: 'var(--error)', fontSize: '12px' }}>{errors.brandName}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Instagram Handle <span>*</span></label>
              <input
                className="form-input"
                placeholder="@brandname or instagram.com/brandname"
                value={form.instagram}
                onChange={e => update('instagram', e.target.value)}
              />
              {errors.instagram && <span style={{ color: 'var(--error)', fontSize: '12px' }}>{errors.instagram}</span>}
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg"
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? <><div className="spinner" /> Creating...</> : 'Create Report'}
        </button>

      </div>
    </div>
  );
}
