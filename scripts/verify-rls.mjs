// Security check for the Supabase schema. Run it after any change to
// supabase/migrations/*.sql:
//
//   node scripts/verify-rls.mjs
//
// It signs up two throwaway accounts with the *anon* key -- the same key the
// browser has -- and tries to do the things a user should not be able to do.
// Row level security is the only thing standing between one salesperson and
// everyone else's data, and it is quiet when it is wrong: a bad policy does
// not throw, it just returns rows it shouldn't. This makes that audible.
//
// It caught a real one: `for update using (id = auth.uid())` on profiles reads
// like "edit your own row" but permits editing any COLUMN of that row, so any
// user could set is_admin = true and read the whole team's numbers.
//
// Requires the Email provider enabled with "Confirm email" off. The test
// accounts it leaves behind can be removed with:
//   delete from auth.users where email like 'claude-test-%@example.com';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = await readFile(path.join(root, '.env.local'), 'utf8');
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const URL_ = pick('NEXT_PUBLIC_SUPABASE_URL');
const ANON = pick('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!URL_ || !ANON) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing from .env.local');
  process.exit(1);
}

const stamp = Math.floor(Math.random() * 100000);
const mk = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); process.exitCode = 1; };

async function signUp(label) {
  const client = mk();
  const email = `claude-test-${label}-${stamp}@example.com`;
  const { data, error } = await client.auth.signUp({ email, password: `Test-${stamp}-pw!` });
  if (error) throw new Error(`${label} signup: ${error.message}`);
  if (!data.session) throw new Error(`${label} signup returned no session — is "Confirm email" still on?`);
  return { client, user: data.user, email };
}

console.log('\n=== 1. signup + profile trigger ===');
const A = await signUp('a');
console.log(`  user A: ${A.email}`);
const { data: profA } = await A.client.from('profiles').select('*').eq('id', A.user.id).maybeSingle();
profA ? ok('profile row auto-created by trigger') : bad('NO profile row — trigger did not fire');
if (profA) (profA.is_admin === false ? ok('is_admin defaults to false') : bad(`is_admin defaulted to ${profA.is_admin}`));

console.log('\n=== 2. privilege escalation ===');
await A.client.from('profiles').update({ is_admin: true }).eq('id', A.user.id);
const { data: afterEsc } = await A.client.from('profiles').select('is_admin').eq('id', A.user.id).maybeSingle();
afterEsc?.is_admin === true
  ? bad('USER PROMOTED THEMSELVES TO ADMIN via profiles update')
  : ok('self-promotion to admin blocked');

console.log('\n=== 3. reports + events ===');
const { data: rep, error: repErr } = await A.client.from('reports')
  .insert({ user_id: A.user.id, brand_name: 'Test Brand', instagram: '@testbrand', report_data: { about: { tagline: 'hi' } } })
  .select('id').single();
repErr ? bad(`insert report: ${repErr.message}`) : ok('report created');

if (rep) {
  for (const action of ['report_created', 'deck_downloaded', 'deck_downloaded']) {
    const { error } = await A.client.from('deck_events').insert({ user_id: A.user.id, report_id: rep.id, action });
    if (error) bad(`insert ${action}: ${error.message}`);
  }
  ok('events inserted');

  const { data: sumA } = await A.client.from('usage_summary').select('*').eq('user_id', A.user.id).maybeSingle();
  (sumA?.reports_created === 1 && sumA?.decks_downloaded === 2)
    ? ok(`usage_summary counts correct (${sumA.reports_created} reports, ${sumA.decks_downloaded} decks)`)
    : bad(`usage_summary wrong: ${JSON.stringify(sumA)}`);
}

console.log('\n=== 4. cross-user isolation ===');
const B = await signUp('b');
console.log(`  user B: ${B.email}`);

const { data: stolen } = await B.client.from('reports').select('*').eq('id', rep?.id).maybeSingle();
stolen ? bad('USER B CAN READ USER A REPORT') : ok('B cannot read A report by id');

const { data: allReports } = await B.client.from('reports').select('id');
allReports?.length === 0 ? ok('B listing reports sees none of A') : bad(`B sees ${allReports?.length} reports`);

const { data: sumAll } = await B.client.from('usage_summary').select('user_id');
sumAll?.length === 1 ? ok('B usage_summary returns only their own row') : bad(`B sees ${sumAll?.length} usage rows`);

await B.client.from('reports').update({ brand_name: 'hacked' }).eq('id', rep?.id);
const { data: check } = await A.client.from('reports').select('brand_name').eq('id', rep?.id).maybeSingle();
check?.brand_name === 'Test Brand' ? ok('B cannot overwrite A report') : bad(`B modified A report -> ${check?.brand_name}`);

const { error: fakeErr } = await B.client.from('deck_events').insert({ user_id: A.user.id, action: 'deck_downloaded' });
fakeErr ? ok('B cannot log events as A') : bad('B LOGGED AN EVENT AS USER A');

console.log(`\ntest accounts left behind: ${A.email}, ${B.email}`);
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nall checks passed');
