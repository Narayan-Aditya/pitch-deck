import { getSupabase } from './supabase/client';

// Report persistence, backed by Postgres. Access control lives in row level
// security, not here — every query below is scoped to the signed-in user by
// the database itself, so a missing WHERE clause leaks nothing.
//
// The exported names are unchanged from the localStorage version these
// replaced, which is why the pages needed almost no edits.

const TABLE = 'reports';
const COLUMNS = 'id, brand_name, instagram, report_data, created_at, updated_at';

// The database is snake_case, the pages are camelCase. Translating in one place
// keeps the components from having to know which is which.
function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    brandName: row.brand_name,
    instagram: row.instagram || '',
    reportData: row.report_data || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export async function getReport(id) {
  // maybeSingle, not single: another user's report is invisible under RLS and
  // comes back as zero rows, which single() would raise as an error. The page
  // renders null as "Report not found", which is exactly right.
  const { data, error } = await getSupabase()
    .from(TABLE).select(COLUMNS).eq('id', id).maybeSingle();

  if (error) {
    // A malformed id is a 404 in disguise, not a server fault worth shouting
    // about — Postgres rejects it as invalid uuid syntax.
    if (error.code === '22P02') return null;
    throw new Error(error.message);
  }
  return fromRow(data);
}

export async function listReports() {
  const { data, error } = await getSupabase()
    .from(TABLE).select(COLUMNS).order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

export async function deleteReport(id) {
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// One-time rescue of reports made before sign-in existed.
//
// Those live in this browser's localStorage and are invisible to every other
// device. Without this they would simply vanish the first time someone signs
// in, which is a rotten way to find out a feature shipped.
// ---------------------------------------------------------------------------
const LEGACY_KEY = 'og_reports';

export function countLocalReports() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(raw) ? raw.length : 0;
  } catch {
    return 0;
  }
}

export async function importLocalReports() {
  const user = await requireUser();
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
  } catch {
    return 0;
  }
  if (!Array.isArray(legacy) || !legacy.length) return 0;

  const rows = legacy.map(r => ({
    user_id: user.id,
    brand_name: r.brandName || 'Untitled',
    instagram: r.instagram || null,
    report_data: r.reportData || {},
  }));

  const { error } = await getSupabase().from(TABLE).insert(rows);
  if (error) throw new Error(error.message);

  // Only clear once the insert has actually succeeded, so a failure here
  // leaves the originals sitting safely where they were.
  localStorage.removeItem(LEGACY_KEY);
  return rows.length;
}
