import { getSupabase } from './supabase/client';

// Who made and downloaded what. Written as an append-only event log rather
// than counters on a user row: counts are one group-by away, but a counter can
// never answer "when" or "for which brand", and those are the questions that
// actually get asked once the numbers look odd.

export const REPORT_CREATED = 'report_created';
export const DECK_DOWNLOADED = 'deck_downloaded';

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

// Reads from the usage_summary view. The same view backs the admin table —
// it is declared security_invoker, so RLS decides how many rows come back:
// every user for an admin, only their own for everyone else.
export async function fetchMyUsage(userId) {
  const { data, error } = await getSupabase()
    .from('usage_summary')
    .select('reports_created, decks_downloaded, last_activity')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function fetchAllUsage() {
  const { data, error } = await getSupabase()
    .from('usage_summary')
    .select('user_id, email, full_name, avatar_url, is_admin, reports_created, decks_downloaded, last_activity')
    .order('reports_created', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}
