import { NextResponse } from 'next/server';
import { loadCreatorCorpus, toWireItem } from '@/lib/creatorCorpus';
import { buildQueryProfile, rankCandidates, THRESHOLDS } from '@/lib/relevance';
import { rankCreatorContent } from '@/lib/openaiGenerate';

const CANDIDATE_LIMIT = 12;

// Stage 2 is a model call, so the 10s serverless default isn't enough. 60s is
// the Hobby-plan maximum.
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

    // Stage 2: the model picks the best few and writes the per-card reason.
    // It also adjudicates any sentimentRisk item — a video that criticises the
    // prospect must never reach the slide.
    let picks = null;
    let ranked = true;
    try {
      picks = await rankCreatorContent({ brandName, about, candidates, limit });
    } catch (err) {
      console.error('Creator rerank failed, falling back to deterministic:', err.message);
      ranked = false;
    }

    let matches;
    if (picks) {
      const byId = new Map(candidates.map(c => [c.id, c]));
      matches = picks
        .filter(p => p.relevance !== 'weak')
        .map(p => {
          const c = byId.get(p.id);
          if (!c) return null;
          // A regex-flagged item only survives if the model explicitly called it positive.
          if (c.sentimentRisk && p.sentiment !== 'positive') return null;
          // And no brand-tier item survives a negative read at all. The regex
          // catches obvious hostility ("SCAM", "FOOLING"); plenty of critical
          // framing isn't obvious, so the model's judgement gates every item
          // that actually names the prospect.
          if (c.brandHit && p.sentiment === 'negative') return null;
          return { ...toRankedItem(c), relevance: p.relevance, reason: p.reason };
        })
        .filter(Boolean)
        .slice(0, limit);
    } else {
      // Degraded path: stricter floor, and never trust a flagged item without
      // the model having vetted it.
      matches = candidates
        .filter(c => !c.sentimentRisk)
        .filter(c => c.brandHit || c.score >= THRESHOLDS.DEGRADED_FLOOR)
        .slice(0, limit)
        .map(c => ({ ...toRankedItem(c), relevance: 'adjacent', reason: '' }));
    }

    if (matches.length < THRESHOLDS.MIN_ITEMS && !matches.some(m => m.tier === 'brand')) {
      return NextResponse.json({
        success: true, matches: [], reason: 'below-threshold',
        bestScore: candidates[0]?.score ?? 0,
        ...(debug ? { debug: debugPayload } : {}),
      });
    }

    return NextResponse.json({
      success: true, ranked, matches,
      ...(debug ? { debug: debugPayload } : {}),
    });
  } catch (err) {
    console.error('Creator match error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Match failed' }, { status: 500 });
  }
}
