import { NextResponse } from 'next/server';
import { loadCreatorCorpus, toWireItem } from '@/lib/creatorCorpus';

// Browse and search the creator's back catalogue by hand.
//
// This is the companion to /api/creator-matches, not a replacement. That route
// answers "which of our videos is relevant to THIS prospect" and involves a
// model call; this one answers "let me find the one I already have in mind",
// and is a plain substring search with no model and no scoring.
//
// It exists as a route rather than a generated client-side index because the
// catalogue is 685 items — shipping that to every browser to power a picker
// that is used occasionally would cost more than the search does.
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const MAX_QUERY_LEN = 80;

// Deliberately raw text, not the tokeniser from lib/relevance.js. That one
// canonicalises for topical matching — it drops words under three characters,
// strips stopwords and singularises, all of which are wrong when someone is
// typing the words they remember from a title.
function haystack(item) {
  return (item.platform === 'youtube'
    ? [item.title, (item.tags || []).join(' '), item.descHead]
    : [item.caption, (item.hashtags || []).join(' '), (item.mentions || []).join(' ')]
  ).join(' ').toLowerCase();
}

// Engagement means different things per platform — YouTube reports views,
// Instagram reports none at all — so items are ranked within their own platform
// and then interleaved. Sorting a mixed list by a raw number would bury every
// YouTube episode under reels that carry a bigger one.
function engagementOf(item) {
  return (item.platform === 'youtube' ? item.views : item.likes) ?? 0;
}

function interleave(youtube, instagram, limit) {
  const out = [];
  for (let i = 0; out.length < limit && (i < youtube.length || i < instagram.length); i++) {
    if (i < youtube.length && out.length < limit) out.push(youtube[i]);
    if (i < instagram.length && out.length < limit) out.push(instagram[i]);
  }
  return out;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').trim().slice(0, MAX_QUERY_LEN).toLowerCase();
  const platform = params.get('platform');
  const limit = Math.min(Math.max(parseInt(params.get('limit'), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  try {
    const corpus = await loadCreatorCorpus();
    if (corpus.reason === 'no-creator-data' || !corpus.items.length) {
      return NextResponse.json({ success: true, items: [], total: 0, reason: 'no-creator-data' });
    }

    // Every word must appear somewhere in the item. An AND search is what
    // people expect when they add a second word to narrow things down.
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    let pool = corpus.items;
    if (platform === 'youtube' || platform === 'instagram') {
      pool = pool.filter(i => i.platform === platform);
    }
    const hits = terms.length
      ? pool.filter(i => { const h = haystack(i); return terms.every(t => h.includes(t)); })
      : pool;

    const byEngagement = (a, b) => engagementOf(b) - engagementOf(a);
    const yt = hits.filter(i => i.platform === 'youtube').sort(byEngagement);
    const ig = hits.filter(i => i.platform === 'instagram').sort(byEngagement);

    // With no query this is "our best-performing content", which is a better
    // starting point than the oldest 24 items and is usually what someone
    // reaching for this picker actually wants.
    const picked = platform ? [...yt, ...ig].slice(0, limit) : interleave(yt, ig, limit);

    return NextResponse.json({
      success: true,
      total: hits.length,
      items: picked.map(i => toWireItem(i, { tier: 'topical', relevance: 'direct', reason: '' })),
    });
  } catch (err) {
    console.error('Creator library search failed:', err);
    return NextResponse.json({ success: false, error: err.message || 'Search failed' }, { status: 500 });
  }
}
