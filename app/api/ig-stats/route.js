import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Serves ig_data.py's stats.json so the report page can auto-fill the
// Instagram numbers on load instead of making someone pick the file by hand.
// Reads from the project root at request time (not bundled at build), so
// re-running the scraper is picked up without restarting the server.
//
// Deployment note: on Firebase Hosting this reads the file from the deployed
// bundle, which won't reflect scraper runs on someone's laptop — the manual
// "Import from stats.json" button on the Instagram tab remains the fallback
// for that case.
export async function GET(request) {
  const handle = (new URL(request.url).searchParams.get('handle') || '').replace(/^@/, '').toLowerCase();

  let records;
  try {
    const raw = await readFile(path.join(process.cwd(), 'stats.json'), 'utf8');
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    // Missing file is the normal case before the scraper has ever run —
    // report it as "no stats", not as a server error.
    if (err.code === 'ENOENT') {
      return NextResponse.json({ success: true, stats: null, reason: 'no-stats-file' });
    }
    return NextResponse.json({ success: false, error: `Could not read stats.json: ${err.message}` }, { status: 500 });
  }

  if (!handle) {
    return NextResponse.json({ success: false, error: 'handle query param is required' }, { status: 400 });
  }

  const match = records.find((r) => (r.username || '').toLowerCase() === handle);
  if (!match) {
    return NextResponse.json({
      success: true,
      stats: null,
      reason: 'handle-not-in-file',
      available: records.map((r) => r.username).filter(Boolean),
    });
  }

  return NextResponse.json({ success: true, stats: match });
}
