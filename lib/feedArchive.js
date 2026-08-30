import { getServiceClient } from './supabase/service.js';

// What the trade press has said, kept past the feeds' own memory.
//
// The three RSS feeds carry roughly fifty items each — a few days. Without this
// table "updates for this brand" could only ever mean "updates this week", and
// a History page that forgets is not history.
//
// Filled as a side effect of the home page's prospect poll rather than by a
// cron: the app has no scheduler, and a poll already happens whenever anyone
// opens the home page. So the archive grows on ordinary use.
//
// Degrades to a no-op without SUPABASE_SERVICE_KEY, and swallows its own
// errors, for the same reason lib/auditCache.js does — a history feature that
// is down must never take the prospect feed down with it.
const TABLE = 'feed_archive';

/** Write everything a poll parsed. Returns how many rows were new.
 *
 * Upsert on item_url, ignoring conflicts: the same story is polled every half
 * hour and must stay one row. Two outlets reporting it are two rows, which is
 * right — they are two independent confirmations, and the History page says so. */
export async function archiveItems(prospects) {
  const supabase = getServiceClient();
  if (!supabase || !prospects?.length) return 0;

  const rows = prospects
    .filter(p => p.url && p.key)
    .map(p => ({
      brand_key: p.key,
      brand_name: p.brand,
      signal_type: p.trigger,
      reason: p.reason,
      item_url: p.url,
      source: p.source,
      published_at: p.publishedAt,
    }));
  if (!rows.length) return 0;

  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'item_url', ignoreDuplicates: true });
    if (error) {
      console.error('feed archive write failed:', error.message);
      return 0;
    }
    return rows.length;
  } catch (err) {
    console.error('feed archive write failed:', err?.message || err);
    return 0;
  }
}

/** Every archived update for these brand keys, newest first.
 *
 * Keyed lookup rather than one query per brand: a person watching forty brands
 * should cost one round trip, not forty. Returns a Map so the caller can attach
 * updates to brands without a second pass. */
export async function updatesFor(brandKeys, { perBrand = 8 } = {}) {
  const supabase = getServiceClient();
  const byKey = new Map();
  if (!supabase || !brandKeys?.length) return byKey;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('brand_key, brand_name, signal_type, reason, item_url, source, published_at, archived_at')
      .in('brand_key', brandKeys)
      .order('published_at', { ascending: false, nullsFirst: false })
      // A ceiling rather than a per-brand limit, which PostgREST cannot express
      // in one query. Generous enough that the cap is only reached by someone
      // watching many brands that are all in the news at once.
      .limit(brandKeys.length * perBrand);

    if (error) {
      console.error('feed archive read failed:', error.message);
      return byKey;
    }

    for (const row of data || []) {
      const list = byKey.get(row.brand_key) || [];
      if (list.length >= perBrand) continue;
      list.push({
        trigger: row.signal_type,
        reason: row.reason,
        url: row.item_url,
        source: row.source,
        publishedAt: row.published_at,
        archivedAt: row.archived_at,
      });
      byKey.set(row.brand_key, list);
    }
  } catch (err) {
    console.error('feed archive read failed:', err?.message || err);
  }

  return byKey;
}
