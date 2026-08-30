import { NextResponse } from 'next/server';
import { loadCreatorCorpus, toWireItem } from '@/lib/creatorCorpus';
import { buildQueryProfile, rankCandidates, THRESHOLDS } from '@/lib/relevance';

const CANDIDATE_LIMIT = 12;

// Loading and scoring the whole creator corpus on a cold start can outrun the
// 10s serverless default. 60s is the Hobby-plan maximum.
export const maxDuration = 60;

// Wire shape plus the ranking fields only this route produces.
function toRankedItem(s) {
  return toWireItem(s, {
    score: s.score,
    tier: s.brandHit ? 'brand' : 'topical',
    matchedTerms: s.matchedTerms.slice(0, 5),
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const { brandName, about, limit = 3 } = body;
  if (!brandName?.trim()) {
    return NextResponse.json({ success: false, error: 'Brand name is required' }, { status: 400 });
  }

  const debug = new URL(request.url).searchParams.get('debug') === '1';

  try {
    const corpus = await loadCreatorCorpus();
    if (corpus.reason === 'no-creator-data' || !corpus.items.length) {
      return NextResponse.json({ success: true, matches: [], reason: 'no-creator-data' });
    }

    const query = buildQueryProfile({
      brandName,
      industry: about?.industry || '',
      description: about?.description || '',
    });

    const candidates = rankCandidates(corpus.items, query, corpus.idf, corpus.df, {
      limit: CANDIDATE_LIMIT,
      nowMs: Date.now(),
    });

    const debugPayload = debug ? {
      queryTerms: [...query.terms.entries()].map(([t, v]) => ({ t, ...v })).sort((a, b) => b.w - a.w),
      brandKey: query.key,
      corpusCounts: corpus.counts,
      top20: candidates.slice(0, 20).map(c => ({
        platform: c.platform, id: c.id, score: c.score, finalScore: c.finalScore,
        brandHit: c.brandHit, gate: c.gate, sentimentRisk: c.sentimentRisk,
        bestTerm: c.bestTerm, matched: c.matchedTerms.slice(0, 6),
        title: (c.title || c.captionHead || '').slice(0, 80),
      })),
    } : undefined;

    const hasBrandHit = candidates.some(c => c.brandHit && !c.sentimentRisk);
    if (candidates.length < THRESHOLDS.MIN_ITEMS && !hasBrandHit) {
      return NextResponse.json({
        success: true, matches: [], reason: 'below-threshold',
        bestScore: candidates[0]?.score ?? 0,
        ...(debug ? { debug: debugPayload } : {}),
      });
    }

    // Scoring alone decides the slide. Brand-tier items are always kept; topical
    // ones must clear a floor stricter than the one that got them shortlisted.
    // Anything the sentiment regex flagged is dropped outright — there is no
    // second opinion available to clear it, so a possible swipe at the prospect
    // never reaches the slide.
    const matches = candidates
      .filter(c => !c.sentimentRisk)
      .filter(c => c.brandHit || c.score >= THRESHOLDS.TOPICAL_FLOOR)
      .slice(0, limit)
      // Both fields are part of the shape /api/creator-library also emits; the
      // per-item copy that used to fill `reason` came from the model.
      .map(c => ({ ...toRankedItem(c), relevance: 'adjacent', reason: '' }));

    if (matches.length < THRESHOLDS.MIN_ITEMS && !matches.some(m => m.tier === 'brand')) {
      return NextResponse.json({
        success: true, matches: [], reason: 'below-threshold',
        bestScore: candidates[0]?.score ?? 0,
        ...(debug ? { debug: debugPayload } : {}),
      });
    }

    return NextResponse.json({
      success: true, matches,
      ...(debug ? { debug: debugPayload } : {}),
    });
  } catch (err) {
    console.error('Creator match error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Match failed' }, { status: 500 });
  }
}
