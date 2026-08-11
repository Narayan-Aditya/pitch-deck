-- Grant (or remove) admin for any user.
--
-- Admins can see /admin: every person's report and deck counts, and every
-- report in the database. Give it to the people who need the team picture,
-- not to everyone.
--
-- HOW TO RUN
--   Supabase -> SQL Editor. Run the blocks ONE AT A TIME (highlight a block,
--   then press Run) — step 2 needs the id that step 1 prints.
--
-- WHY THIS IS NOT A BUTTON IN THE APP
--   The app deliberately cannot set this column. profiles has no update policy
--   at all, and a trigger rejects is_admin changes whenever auth.uid() is set.
--   RLS cannot restrict individual columns, so a policy that let someone edit
--   their own row also let them set is_admin = true and read the whole team's
--   data — that was a real bug here, caught by scripts/verify-rls.mjs. Running
--   it from the SQL editor is what keeps that door shut.
--
--   The person must sign in with Google at least once before they can be made
--   an admin: the profile row is created by a trigger on signup, so there is
--   nothing to promote until then.


-- ===========================================================================
-- STEP 1 — list everyone who has signed in.
-- Find the person you want and copy their id (first column).
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
-- STEP 2 — grant admin. Paste their id below.
--
-- Match on id, not email: `where email = '...'` reports "UPDATE 0" instead of
-- an error when the address is even slightly off — different case, a stray
-- space, a googlemail alias — so a grant that did nothing looks exactly like
-- one that worked.
-- ===========================================================================
update public.profiles
set is_admin = true
where id = 'PASTE-THEIR-ID-HERE';


-- ===========================================================================
-- STEP 3 — confirm. Everyone listed here can see the whole team's numbers.
-- ===========================================================================
select email, full_name, is_admin from public.profiles where is_admin = true;


-- ===========================================================================
-- TO REMOVE ADMIN — same thing, false instead of true.
-- Takes effect on their next page load; an open tab keeps the link until then,
-- though the data behind it is re-checked by RLS on every query regardless.
-- ===========================================================================
-- update public.profiles set is_admin = false where id = 'PASTE-THEIR-ID-HERE';


-- ---------------------------------------------------------------------------
-- If STEP 1 shows no row for them, they have not signed in yet, or their
-- account predates the signup trigger. This backfills anyone missing a
-- profile; it is safe to run at any time.
--
--   insert into public.profiles (id, email, full_name, avatar_url)
--   select id, email,
--          raw_user_meta_data->>'full_name',
--          raw_user_meta_data->>'avatar_url'
--   from auth.users
--   on conflict (id) do nothing;
-- ---------------------------------------------------------------------------
