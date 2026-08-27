import { NextResponse } from 'next/server';
import { scrapeInstagram } from '@/lib/instagramScrape';
import { getCached, putCached } from '@/lib/auditCache';
import { QuotaExceeded, checkQuota, recordLookup } from '@/lib/quota';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Instagram usernames are letters, digits, periods and underscores, max 30.
// The value is interpolated into a URL, so anything outside that charset is
// rejected outright rather than escaped.
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

// browse2api's own docs say a call typically completes in 20-60s. Comfortably
// inside 60s on average, but well past the 10s serverless default, so this
// still needs the bump.
export const maxDuration = 60;

export async function POST(request) {
  let handle;
  let fresh = false;
  try {
    ({ handle, fresh = false } = await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  handle = (handle || '').trim().replace(/^@/, '');
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { success: false, error: 'that is not a valid Instagram username (letters, numbers, dots and underscores only)' },
      { status: 400 }
    );
  }

  // The middleware already turns anonymous callers away; this is here because
  // the allowance has to be charged to somebody by name.
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id || null;

  // 1. A cache hit costs nothing, so it is served before the allowance is even
  //    consulted. Charging someone for an answer already sitting in Postgres
  //    would make re-opening a prospect cost as much as finding one.
  if (!fresh) {
    const cached = await getCached('instagram', handle);
    if (cached) return NextResponse.json({ success: true, stats: cached });
  }

  // 2. Only now, with a real call about to be made.
  try {
    await checkQuota(userId);
  } catch (err) {
    if (err instanceof QuotaExceeded) {
      // 429 rather than 402: this is the person's own allowance, not the
      // provider's, and the frontend needs to tell those apart.
      return NextResponse.json({ success: false, error: err.message }, { status: 429 });
    }
    throw err;
  }

  try {
    const stats = await scrapeInstagram(handle);
    await putCached('instagram', handle, stats);
    await recordLookup(userId, 'instagram', handle);
    return NextResponse.json({ success: true, stats: { ...stats, cached: { hit: false } } });
  } catch (err) {
    // Messages from scrapeInstagram are written as sentence fragments, because
    // the report page renders them inside "Couldn't do this automatically:
    // {error} — fill it in below."
    const message = err?.name === 'TimeoutError'
      ? 'Instagram took too long to respond'
      : err?.message || 'the lookup failed';
    console.error(`ig-fetch failed for @${handle}:`, err);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
