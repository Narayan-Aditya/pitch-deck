import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { updatesFor } from '@/lib/feedArchive';
import { hasServiceClient } from '@/lib/supabase/service';

// Every brand the caller has looked up, each with whatever the trade press has
// said about it since.
//
// The join happens here rather than in the database because the two halves live
// under different keys: watched_brands is readable by the browser under row
// level security, while feed_archive has RLS on with no policies and is reachable
// only by the service key. A single SQL join would mean exposing the archive to
// the browser or putting the watchlist behind the service key, and neither is
// worth it — this is one query each and they run against the same request.
export const maxDuration = 20;

function countNew(updates, seenAt) {
  // Never seen means every update is new, which is what someone opening History
  // for the first time should be told.
  if (!seenAt) return updates.length;
  const since = new Date(seenAt);
  return updates.filter(u => new Date(u.publishedAt || u.archivedAt) > since).length;
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    // proxy.js already refuses unauthenticated callers; this is the belt to its
    // braces, and the thing that makes user.id below safe to read.
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
    }

    const { data: watched, error } = await supabase
      .from('watched_brands')
      .select('id, brand_key, brand_name, site_url, brand_data, search_count, first_searched, last_searched, updates_seen_at')
      .eq('user_id', user.id)
      .order('last_searched', { ascending: false });

    if (error) throw new Error(error.message);

    const rows = watched || [];
    const updatesByKey = await updatesFor(rows.map(r => r.brand_key));

    const brands = rows.map(r => {
      const updates = updatesByKey.get(r.brand_key) || [];
      return {
        id: r.id,
        key: r.brand_key,
        name: r.brand_name,
        siteUrl: r.site_url,
        // Only the handful the History card actually draws. The rest of the
        // scrape stays in the database rather than crossing the wire on a page
        // that may be listing sixty brands.
        details: summarise(r.brand_data),
        searchCount: r.search_count,
        firstSearched: r.first_searched,
        lastSearched: r.last_searched,
        updates,
        newCount: countNew(updates, r.updates_seen_at),
      };
    });

    return NextResponse.json({
      success: true,
      brands,
      // Without a service key there is no archive at all, and every brand would
      // show zero updates for a reason the page could not otherwise explain.
      archiveAvailable: hasServiceClient(),
    });
  } catch (err) {
    console.error('History error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Could not load history' },
      { status: 500 }
    );
  }
}

function summarise(brandData) {
  const b = brandData || {};
  return {
    industry: b.about?.industry || null,
    description: b.description || b.about?.about_text?.slice(0, 180) || null,
    colour: b.visual_identity?.palette?.primary || null,
    logo: b.logo_url || null,
    instagram: b.instagram || b.social_links?.instagram || null,
    socials: Object.keys(b.social_links || {}),
  };
}
