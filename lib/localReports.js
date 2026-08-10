// localStorage-backed mirror of lib/firestoreReports.js — same function
// signatures, so lib/reportStore.js can swap between them with no page-level
// changes. Used only when AUTH_ENABLED is false.
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

export async function createReport(uid, data) {
  const id = `report_${Date.now()}`;
  const now = new Date().toISOString();
  const reports = readAll();
  reports.push({ ...data, id, ownerId: uid || 'local', createdAt: now, updatedAt: now });
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
