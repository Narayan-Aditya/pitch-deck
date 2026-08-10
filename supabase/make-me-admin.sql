-- Grant yourself admin, without having to guess your own email.
--
-- HOW TO RUN
--   Supabase -> SQL Editor. Run the blocks ONE AT A TIME (highlight a block,
--   then press Run) rather than the whole file, because step 2 depends on what
--   step 1 shows you.
--
-- Why the earlier attempt did nothing: `where email = 'devognihal@gmail.com'`
-- silently updates zero rows if that is not the exact address the Google
-- account carries. Postgres reports "UPDATE 0", not an error, so it looks like
-- it worked. Step 1 removes the guesswork.


-- ===========================================================================
-- STEP 1 — who actually exists?
-- Run this on its own and read the output.
-- ===========================================================================
select
  id,
  email,
  full_name,
  is_admin,
  created_at
from public.profiles
order by created_at;


-- ===========================================================================
-- STEP 2 — promote yourself.
--
-- Copy YOUR id from step 1 (the uuid in the first column) and paste it below.
-- Using the id rather than the email sidesteps every way an address can fail
-- to match: different case, a stray space, a googlemail.com alias, or signing
-- in with a different account than you expected.
-- ===========================================================================
update public.profiles
set is_admin = true
where id = 'PASTE-YOUR-ID-HERE';


-- ===========================================================================
-- STEP 3 — confirm. Expect exactly one row: you.
-- ===========================================================================
select email, full_name, is_admin from public.profiles where is_admin = true;


-- ===========================================================================
-- STEP 4 — clear out test accounts again.
--
-- scripts/verify-rls.mjs creates two fresh throwaway users every run, and it
-- was run again to confirm the escalation fix landed. They cascade away
-- together with their reports and events.
-- ===========================================================================
delete from auth.users where email like 'claude-test-%@example.com';


-- ---------------------------------------------------------------------------
-- If STEP 1 returns NO ROWS AT ALL, the profile row was never created for your
-- login. That means the on_auth_user_created trigger is missing, so re-run
-- supabase/migrations/0001_init.sql and then sign out and back in. The trigger
-- only fires on signup, so an account created while it was absent never got a
-- profile; this backfills any that were missed:
--
--   insert into public.profiles (id, email, full_name, avatar_url)
--   select id, email,
--          raw_user_meta_data->>'full_name',
--          raw_user_meta_data->>'avatar_url'
--   from auth.users
--   on conflict (id) do nothing;
-- ---------------------------------------------------------------------------
