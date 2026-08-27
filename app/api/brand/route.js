import { NextResponse } from 'next/server';
import { GaveUp, InvalidURL, scrapeBrand } from '@/lib/brandScrape';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// The prospect's own website — name, description, About copy, social links, an
// ad-pixel heuristic, and the brand colour the deck's palette is grounded on.
//
// Signed-in only. Nothing here bills a provider, but it makes outbound requests
// to arbitrary URLs on this deployment's behalf, and an open endpoint that does
// that is a proxy for whoever finds it.
//
// The Node runtime is not optional: lib/brandColour.js uses sharp to read the
// logo bitmap, which the edge runtime has no native binary for.
export const runtime = 'nodejs';
// Scraping is one homepage fetch plus at most one About page and a logo, each
// with its own timeout — comfortably inside this, which is here so a hung
// origin returns an error rather than the platform's default 504 page.
export const maxDuration = 60;

export async function POST(request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ success: false, error: 'Please sign in first.' }, { status: 401 });
  }

  let url;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Expected a JSON body with a url.' }, { status: 400 });
  }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ success: false, error: "A brand's website URL is required." }, { status: 400 });
  }

  try {
    return NextResponse.json({ success: true, brand: await scrapeBrand(url) });
  } catch (err) {
    // Three outcomes worth telling apart, because the fix differs: the URL is
    // wrong (theirs to correct), the site refused us (retry or try the www
    // form), or something in here broke (ours).
    if (err instanceof InvalidURL) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    if (err instanceof GaveUp) {
      return NextResponse.json({ success: false, error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { success: false, error: `Couldn't read that site: ${err.message || err}` },
      { status: 500 }
    );
  }
}
