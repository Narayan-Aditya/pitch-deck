-- Post-setup: make yourself an admin, and clear out the throwaway accounts
-- created while testing row level security.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query
--   Open this file, Ctrl+A, Ctrl+C, paste, Run.
--
-- ORDER MATTERS. Run supabase/migrations/0001_init.sql FIRST if you have not
-- re-run it since the is_admin fix. Until you do, any signed-in user can set
-- their own is_admin = true from the browser and read the whole team's numbers.


-- ---------------------------------------------------------------------------
-- 1. Remove the test accounts.
--
-- Do this even if you skip everything else. One of them
-- (claude-test-admin-...) was deliberately promoted to admin to prove the
-- dashboard shows every user, and its password follows a guessable pattern.
-- An admin account with a weak password is worse than no dashboard at all.
--
-- auth.users cascades to profiles, reports and deck_events, so their test
-- reports and events go too.
-- ---------------------------------------------------------------------------
delete from auth.users where email like 'claude-test-%@example.com';


-- ---------------------------------------------------------------------------
-- 2. See who has signed in.
-- Find your own row and copy the exact email into step 3.
-- ---------------------------------------------------------------------------
select email, full_name, is_admin, created_at
from public.profiles
order by created_at;


-- ---------------------------------------------------------------------------
-- 3. Make yourself an admin.
--
-- Change the email below if you signed in with a different Google account than
-- the one shown above. This is the only supported way to grant admin: the app
-- deliberately cannot do it, because a client that can set this flag is a
-- client that can read everyone's data.
-- ---------------------------------------------------------------------------
update public.profiles
set is_admin = true
where email = 'devognihal@gmail.com';


-- ---------------------------------------------------------------------------
-- 4. Confirm. Expect exactly one admin: you.
-- ---------------------------------------------------------------------------
select email, full_name, is_admin from public.profiles where is_admin = true;
