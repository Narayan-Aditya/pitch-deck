import { NextResponse } from 'next/server';
import { scrapeInstagram } from '@/lib/instagramScrape';

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
  try {
    ({ handle } = await request.json());
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

  try {
    const stats = await scrapeInstagram(handle);
    return NextResponse.json({ success: true, stats });
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
