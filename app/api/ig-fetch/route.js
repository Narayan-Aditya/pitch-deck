import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';

const SCRIPT = 'ig_data.py';
const TIMEOUT_MS = 120000;

// Instagram usernames are letters, digits, periods and underscores, max 30.
// This value is passed to a subprocess, so anything outside that charset is
// rejected outright rather than escaped — combined with spawn()'s array form
// (no shell), that leaves no path for argument/command injection.
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

function runScraper(handle, cwd) {
  return new Promise((resolve) => {
    const bin = process.env.PYTHON_BIN || 'python';
    const child = spawn(bin, [SCRIPT, handle], {
      cwd,
      shell: false, // never interpolate through a shell
      // The script prints emoji/unicode; without this Python crashes with a
      // cp1252 UnicodeEncodeError on Windows consoles.
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stdout, stderr: `${stderr}\n[timed out after ${TIMEOUT_MS / 1000}s]` });
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: `Could not start "${bin}": ${err.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

export async function POST(request) {
  let handle;
  try {
    ({ handle } = await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  handle = (handle || '').trim().replace(/^@/, '');
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { success: false, error: 'Invalid Instagram handle (letters, numbers, dots and underscores only).' },
      { status: 400 }
    );
  }

  const cwd = process.cwd();
  const { ok, stdout, stderr } = await runScraper(handle, cwd);

  // The script reports per-handle failures on stdout ("ERR <handle> - ...")
  // and still exits 0, so exit code alone isn't enough to judge success.
  const errLine = stdout.split('\n').find((l) => l.startsWith(`ERR ${handle}`));
  if (errLine) {
    return NextResponse.json(
      { success: false, error: errLine.replace(`ERR ${handle} - `, '').trim() || 'Scrape failed' },
      { status: 502 }
    );
  }
  if (!ok) {
    const detail = (stderr || stdout).trim().split('\n').slice(-3).join(' ').slice(0, 300);
    return NextResponse.json(
      { success: false, error: detail || 'Scraper failed to run' },
      { status: 500 }
    );
  }

  let records;
  try {
    const raw = await readFile(path.join(cwd, 'stats.json'), 'utf8');
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Scraper ran but stats.json could not be read: ${err.message}` },
      { status: 500 }
    );
  }

  const match = records.find((r) => (r.username || '').toLowerCase() === handle.toLowerCase());
  if (!match) {
    return NextResponse.json(
      { success: false, error: `Scraper ran but returned no data for @${handle}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, stats: match });
}
