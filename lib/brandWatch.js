import { getSupabase } from './supabase/client';
import { brandKey } from './prospectsVocab';

// Every brand this person has looked up, and what the scrape found.
//
// Written on a successful lookup rather than on export. Wanting to know more
// about a brand is the signal worth keeping — most lookups never become a deck,
// and until now those were forgotten the moment the tab closed.
//
// Access control is row level security, not this file: every query below is
// scoped to the signed-in user by the database, so a missing WHERE clause leaks
// nothing.

const TABLE = 'watched_brands';

async function currentUser() {
  const { data } = await getSupabase().auth.getUser();
  return data?.user || null;
}

/** Record a lookup. Fire-and-forget by design — a salesperson mid-pitch must
 * still get their deck if this write fails, so it resolves rather than throws.
 *
 * Called on every successful scrape, so a brand looked up four times is one row
 * with search_count 4, not four rows. */
export async function recordSearch({ brandName, siteUrl, brandData }) {
  try {
    const user = await currentUser();
    const key = brandKey(brandName);
    if (!user || !key) return false;

    const supabase = getSupabase();
    // Read-then-write rather than an upsert with a count expression: PostgREST
    // cannot express `search_count = search_count + 1` in an upsert, and the
    // race — the same person scraping the same brand in two tabs in the same
    // second — costs one undercounted search and nothing else.
    const { data: existing } = await supabase
      .from(TABLE)
      .select('id, search_count')
      .eq('user_id', user.id)
      .eq('brand_key', key)
      .maybeSingle();

    const row = {
      user_id: user.id,
      brand_key: key,
      brand_name: brandName,
      site_url: siteUrl || null,
      // Always the newest scrape. A brand that has since rebranded or changed
      // its colour should read as it is now, not as it was the first time.
      brand_data: brandData || {},
      last_searched: new Date().toISOString(),
    };

    const { error } = existing
      ? await supabase
        .from(TABLE)
        .update({ ...row, search_count: (existing.search_count || 1) + 1 })
        .eq('id', existing.id)
      : await supabase.from(TABLE).insert(row);

    if (error) {
      console.error('watch write failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('watch write failed:', err?.message || err);
    return false;
  }
}

/** Stop tracking a brand. */
export async function unwatchBrand(id) {
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Mark a brand's updates as read, so the "new" count starts again from here. */
export async function markUpdatesSeen(id) {
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ updates_seen_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
