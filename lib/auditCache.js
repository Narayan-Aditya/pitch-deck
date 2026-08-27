import { getServiceClient } from './supabase/service.js';

// The Instagram lookup is the only thing in this app billed per call, and until
// now nothing cached it — two people pitching the same prospect in the same week
// paid twice, and so did one person re-opening a report.
//
// Degrades to a no-op when SUPABASE_SERVICE_KEY is unset, so a local checkout
// with no service key still runs everything, just uncached. Every function here
// swallows its own errors for the same reason: a cache that is down must never
// be the thing that fails a lookup.
const TABLE = 'audit_cache';
const DEFAULT_TTL_DAYS = 7;

/** How long a cached lookup may answer for. This is the knob that decides how
 * much browse2api bills — raise it to spend less, lower it for fresher follower
 * counts. 0 disables expiry entirely. */
export function ttlDays() {
  const raw = Number.parseInt(process.env.AUDIT_CACHE_TTL_DAYS ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_DAYS;
}

/** @HouseOfSarkar and houseofsarkar are one account, so they get one row. */
export function normalizeHandle(handle) {
  return String(handle || '').trim().replace(/^@/, '').toLowerCase();
}

/** The cached payload, or null — on a miss, an expiry, or any failure at all. */
export async function getCached(platform, handle) {
  const supabase = getServiceClient();
  const key = normalizeHandle(handle);
  if (!supabase || !key) return null;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('payload, fetched_at')
      .eq('platform', platform)
      .eq('handle', key)
      .maybeSingle();

    if (error || !data?.payload) return null;

    const days = ttlDays();
    if (days) {
      const age = Date.now() - new Date(data.fetched_at).getTime();
      if (age > days * 86400000) return null;
    }

    // Copied rather than stamped in place. The row this came from is throwaway
    // here, but a function that quietly mutates a structure it was handed is a
    // trap for whoever caches the response object next.
    return { ...data.payload, cached: { hit: true, fetched_at: data.fetched_at } };
  } catch {
    return null;
  }
}

/** Store a lookup. Best-effort — a failure costs a future cache hit and nothing
 * else, so it is never raised. */
export async function putCached(platform, handle, payload) {
  const supabase = getServiceClient();
  const key = normalizeHandle(handle);
  if (!supabase || !key || !payload || typeof payload !== 'object') return;

  try {
    const { cached, ...clean } = payload;
    await supabase.from(TABLE).upsert(
      { platform, handle: key, payload: clean, fetched_at: new Date().toISOString() },
      { onConflict: 'platform,handle' }
    );
  } catch {
    /* see the module comment: a cache write is never worth failing a request */
  }
}
