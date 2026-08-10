import { NextResponse } from 'next/server';

// Fetches YouTube thumbnails server-side and returns them base64-encoded.
//
// Two reasons this is a server route rather than letting the browser fetch
// i.ytimg.com directly (which CORS would actually allow):
//  1. pptxgenjs wraps all media in Promise.all and REJECTS on any failure, so
//     one flaky image would kill the entire deck export. Returning null here
//     lets the slide fall back to a drawn tile — cosmetic, not fatal.
//  2. A missing YouTube thumbnail returns HTTP 404 with Content-Type
//     image/jpeg and a ~1.1KB grey placeholder. Only a server-side check of
//     res.ok AND byte length catches that; the browser would silently embed
//     a grey rectangle into a client-facing deck.
const TIER_ORDER = ['hqdefault', 'sddefault', 'mqdefault'];
const MAX_ITEMS = 4;
const TOTAL_BUDGET_BYTES = 400 * 1024;
const MIN_VALID_BYTES = 2000;
const FETCH_TIMEOUT_MS = 6000;

const cache = new Map(); // `${platform}:${id}:${tier}` -> { dataUrl, w, h, tier }

const TIER_DIMS = {
  hqdefault: { w: 480, h: 360 },
  sddefault: { w: 640, h: 480 },
  mqdefault: { w: 320, h: 180 },
};

async function fetchThumb(videoId, preferredTier) {
  const tiers = preferredTier ? [preferredTier, ...TIER_ORDER.filter(t => t !== preferredTier)] : TIER_ORDER;
  for (const tier of tiers) {
    const key = `youtube:${videoId}:${tier}`;
    if (cache.has(key)) return cache.get(key);
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${tier}.jpg`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_VALID_BYTES) continue; // the grey 404 placeholder
      const entry = {
        dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}`,
        bytes: buf.length,
        tier,
        ...(TIER_DIMS[tier] || { w: 480, h: 360 }),
      };
      cache.set(key, entry);
      return entry;
    } catch {
      // try the next tier
    }
  }
  return null;
}

export async function POST(request) {
  let items;
  try {
    ({ items } = await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  const preferredTier = process.env.CREATOR_THUMB_TIER
    ? `${process.env.CREATOR_THUMB_TIER}default`
    : null;

  const thumbs = {};
  let spent = 0;

  for (const item of list) {
    // Instagram's stored image URLs are signed and already expired, so reels
    // always render as drawn tiles. Only YouTube is fetchable.
    if (item?.platform !== 'youtube' || !/^[A-Za-z0-9_-]{5,20}$/.test(item.id || '')) {
      thumbs[item?.id] = null;
      continue;
    }
    if (spent >= TOTAL_BUDGET_BYTES) {
      thumbs[item.id] = null; // fail soft once the deck-size budget is used up
      continue;
    }
    const entry = await fetchThumb(item.id, preferredTier);
    if (entry) {
      spent += entry.bytes;
      thumbs[item.id] = { dataUrl: entry.dataUrl, w: entry.w, h: entry.h, tier: entry.tier };
    } else {
      thumbs[item.id] = null;
    }
  }

  return NextResponse.json({ success: true, thumbs });
}
