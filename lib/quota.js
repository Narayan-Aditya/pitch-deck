import { getServiceClient } from './supabase/service.js';
import { normalizeHandle } from './auditCache.js';

// The monthly Instagram allowance.
//
// Counted from `lookup_events`, which only this module writes and only with the
// service key. That separation is the point: deck_events is inserted by the
// browser under RLS, and a ledger the browser can write is not a limit.
//
// Only *paid* lookups are recorded. The allowance caps browse2api spending, not
// how often somebody may look at a prospect — re-opening the same brand four
// times in a week should cost one lookup, which is what happens when the check
// runs after the cache has already missed.
//
// It deliberately does NOT fail closed on a Supabase outage. Locking the whole
// team out of a tool they are mid-pitch with is a worse outcome than a few
// uncounted lookups, and the scenario is rare and self-correcting.
const TABLE = 'lookup_events';
const DEFAULT_MONTHLY_LIMIT = 20;

export class QuotaExceeded extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuotaExceeded';
  }
}

/** 0 removes the cap. */
export function monthlyLimit() {
  const raw = Number.parseInt(process.env.INSTAGRAM_MONTHLY_LIMIT ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MONTHLY_LIMIT;
}

function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Paid lookups this person has spent this calendar month, or null when the
 * count could not be read (unconfigured, or Supabase unreachable). */
export async function usedThisMonth(userId, platform = 'instagram') {
  const supabase = getServiceClient();
  if (!supabase || !userId) return null;

  try {
    const { count, error } = await supabase
      .from(TABLE)
      // head:true asks for the count without a page of rows behind it.
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('platform', platform)
      .gte('created_at', monthStartIso());

    if (error) return null;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

/** Throws QuotaExceeded if this person has no allowance left.
 *
 * Call immediately before the paid call and only after the cache has missed. */
export async function checkQuota(userId, platform = 'instagram') {
  const limit = monthlyLimit();
  if (!limit || platform !== 'instagram') return;

  const used = await usedThisMonth(userId, platform);
  if (used === null) return; // unreadable ledger — see the module comment

  if (used >= limit) {
    throw new QuotaExceeded(
      `you have used all ${limit} Instagram lookups for this month — accounts already ` +
      'looked up still work, and the allowance resets on the 1st'
    );
  }
}

/** Log one paid lookup. Best-effort: a failure costs an undercount, never the
 * lookup somebody is waiting on. */
export async function recordLookup(userId, platform, handle) {
  const supabase = getServiceClient();
  if (!supabase || !userId) return;
  try {
    await supabase.from(TABLE).insert({
      user_id: userId,
      platform,
      handle: normalizeHandle(handle),
    });
  } catch {
    /* see above */
  }
}

/** What the UI shows next to the allowance. */
export async function quotaStatus(userId) {
  const limit = monthlyLimit();
  const used = await usedThisMonth(userId);
  return {
    limit,
    used,
    remaining: used === null || !limit ? null : Math.max(0, limit - used),
  };
}
