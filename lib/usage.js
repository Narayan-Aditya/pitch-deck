import { getSupabase } from './supabase/client';

// Who made and downloaded what. Written as an append-only event log rather
// than counters on a user row: counts are one group-by away, but a counter can
// never answer "when" or "for which brand", and those are the questions that
// actually get asked once the numbers look odd.

// These strings are also a CHECK constraint on deck_events.action. Adding one
// here without the matching migration makes every insert fail silently, since
// logging is fire-and-forget — see supabase/migrations/0002_slides_export.sql.
export const REPORT_CREATED = 'report_created';
export const DECK_DOWNLOADED = 'deck_downloaded';
export const SLIDES_EXPORTED = 'slides_exported';

// Fire-and-forget by design. Tracking is a side effect of the work, never a
// precondition for it — a salesperson mid-pitch must still get their deck if
// the log write fails, so this resolves rather than throws.
export async function logDeckEvent(action, reportId = null) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return false;

    const { error } = await supabase.from('deck_events').insert({
      user_id: data.user.id,
      report_id: reportId,
      action,
    });
    if (error) {
      console.error('usage log failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('usage log failed:', err?.message || err);
    return false;
  }
}

// Reads from the usage_summary view, which is declared security_invoker, so
// RLS decides how many rows come back: every user for an admin, only their own
// for everyone else.
export async function fetchAllUsage() {
  const { data, error } = await getSupabase()
    .from('usage_summary')
    .select('user_id, email, full_name, avatar_url, is_admin, reports_created, decks_downloaded, slides_exported, lookups_this_month, last_activity')
    .order('reports_created', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// The brands one person has built decks for, newest first.
//
// Read straight off `reports` rather than joining through deck_events: the row
// is created on a person's first export and carries both the brand name and
// the date, so it is already one row per deck built. The "reports read own or
// admin" policy is what lets the admin drawer ask about somebody else — a
// non-admin calling this for another user_id gets an empty list, not an error.
export async function fetchUserBrands(userId) {
  const { data, error } = await getSupabase()
    .from('reports')
    .select('id, brand_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}
