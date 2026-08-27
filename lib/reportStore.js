import { getSupabase } from './supabase/client';

// One row per deck, written when it is exported.
//
// Nothing reads these back any more — the History page and the report editor
// are gone, and the admin dashboard counts from deck_events instead. They are
// still written because they are the only record of *which* prospect was
// pitched, which costs one insert and would be unrecoverable if dropped. The
// five readers that used to live here (getReport, listReports, deleteReport
// and the two localStorage-import helpers) went with the pages that called them.
//
// Access control lives in row level security, not here — every query below is
// scoped to the signed-in user by the database itself, so a missing WHERE
// clause leaks nothing.

const TABLE = 'reports';

async function requireUser() {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data?.user) throw new Error('You have been signed out — please sign in again.');
  return data.user;
}

export async function createReport({ brandName, instagram, reportData }) {
  const user = await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert({
      user_id: user.id,
      brand_name: brandName,
      instagram: instagram || null,
      report_data: reportData || {},
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateReport(id, { reportData, brandName, instagram }) {
  const patch = {};
  if (reportData !== undefined) patch.report_data = reportData;
  if (brandName !== undefined) patch.brand_name = brandName;
  if (instagram !== undefined) patch.instagram = instagram;
  if (!Object.keys(patch).length) return;

  const { error } = await getSupabase().from(TABLE).update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
