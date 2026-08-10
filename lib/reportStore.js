// Report persistence — browser localStorage, no backend and no sign-in.
//
// This used to dispatch between Firestore and localStorage depending on an
// auth flag. The Firebase half is gone, so the indirection went with it and
// this is now the implementation rather than a switch.
//
// Consequence worth knowing: reports live in whichever browser created them.
// They don't sync across devices or people, and clearing site data wipes them.
const KEY = 'og_reports';

function readAll() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function writeAll(reports) {
  localStorage.setItem(KEY, JSON.stringify(reports));
}

export async function createReport(data) {
  const id = `report_${Date.now()}`;
  const now = new Date().toISOString();
  const reports = readAll();
  reports.push({ ...data, id, createdAt: now, updatedAt: now });
  writeAll(reports);
  return id;
}

export async function updateReport(id, data) {
  const reports = readAll().map(r =>
    r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
  );
  writeAll(reports);
}

export async function getReport(id) {
  return readAll().find(r => r.id === id) || null;
}

export async function listReports() {
  return readAll().slice().reverse();
}

export async function deleteReport(id) {
  writeAll(readAll().filter(r => r.id !== id));
}
