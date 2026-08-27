-- Close the door. Only @opengrey.media accounts get in.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query
--   Paste this whole file, Run. It ends by listing every account that is
--   currently signed up but outside the allowlist -- read that list, it is the
--   point of this migration.
--
-- Run 0001-0003 first. Safe to run more than once.
--
-- WHY
--   Sign-in has been open to any Google account since the app was built. Every
--   sign-in can spend money -- the Instagram audit bills per lookup -- and one
--   personal gmail address had already been made an admin, which means read
--   access to the whole team's numbers.

-- ---------------------------------------------------------------------------
-- The allowlist, as a function rather than inline, so it changes in one place.
-- ---------------------------------------------------------------------------
create or replace function public.email_is_allowed(addr text) returns boolean
language sql immutable as $fn$
  select lower(coalesce(addr, '')) like '%@opengrey.media';
$fn$;

-- ---------------------------------------------------------------------------
-- Refuse the account at signup.
--
-- Raising here aborts the whole transaction, so a stray Google account never
-- becomes a user at all. Everything else in this function is unchanged from
-- 0001_init.sql.
--
-- This is defence in depth, not the only gate: proxy.js checks the domain on
-- every request, which is what stands between an account that already exists
-- and the browse2api bill.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.email_is_allowed(new.email) then
    raise exception 'Only @opengrey.media accounts can sign in to this tool.';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $fn$;

-- The trigger itself is unchanged; recreated so this file stands alone.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Accounts that already exist.
--
-- A trigger only refuses NEW signups. Anyone already signed up stays signed up,
-- and the middleware will start turning them away on their next request -- but
-- their rows are still here, and any admin flag among them is still live.
--
-- Nothing is deleted automatically. Removing a person also removes their decks
-- and their usage history through the cascade, and which of these are stale
-- test logins versus somebody who should be moved onto a work address is not a
-- decision SQL should make. The listing at the bottom is what to act on.
--
-- To revoke admin without removing the account:
--   update public.profiles set is_admin = false where email = 'someone@gmail.com';
--
-- To remove an account entirely (cascades to profiles, reports, deck_events,
-- lookup_events):
--   delete from auth.users where email = 'someone@gmail.com';
-- ---------------------------------------------------------------------------

select
  p.email,
  p.is_admin,
  p.created_at,
  (select count(*) from public.deck_events e where e.user_id = p.id) as deck_events
from public.profiles p
where not public.email_is_allowed(p.email)
order by p.is_admin desc, p.created_at;
