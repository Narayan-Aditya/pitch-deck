-- Supabase schema: Google login + per-user deck usage tracking.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query
--   Open this file, Ctrl+A, Ctrl+C, paste into the editor, Run.
--   It should finish by listing three rows: deck_events, profiles, reports.
--
-- Safe to run more than once. Every statement is `if not exists` /
-- `or replace` / `drop ... if exists` first, so a half-finished earlier
-- attempt gets repaired rather than throwing "already exists".

-- ---------------------------------------------------------------------------
-- profiles: public mirror of auth.users, plus the admin flag.
-- auth.users lives in a schema the client can't read, so anything the app
-- needs to show about a person has to be copied out here.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reports: what used to live in each browser's localStorage.
-- report_data is the same object the deck builder already consumes, so the
-- .pptx regenerates identically from it and the files never need storing.
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_name text not null,
  instagram text,
  report_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- deck_events: the "kisne kitni PPT banayi" trail.
-- An event log rather than counter columns on profiles. Counts are a group-by
-- away, but a counter can never answer when it happened or for which brand.
-- ---------------------------------------------------------------------------
create table if not exists public.deck_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  action text not null check (action in ('report_created','deck_downloaded')),
  created_at timestamptz not null default now()
);

create index if not exists deck_events_user_idx
  on public.deck_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- is_admin(): SECURITY DEFINER is not optional here.
-- This is called from the SELECT policy on profiles, and it reads profiles.
-- A normal function would re-enter that policy and recurse until Postgres
-- gives up. SECURITY DEFINER runs it outside RLS, which breaks the cycle.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Every new signup gets a profile row automatically. Without this the app
-- would have to create it on first load and cope with the race when two tabs
-- open at once.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at maintained by the database, so it stays true even if some future
-- caller forgets to set it.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists reports_touch_updated_at on public.reports;
create trigger reports_touch_updated_at before update on public.reports
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security. The app talks to Postgres with the anon key from the
-- browser, so these policies are the actual access control -- not the UI.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.deck_events enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- Deliberately NO update policy on profiles.
--
-- An earlier version had `for update using (id = auth.uid())`, which reads
-- like "you may edit your own row" but actually means "you may edit ANY column
-- of your own row" -- including is_admin. RLS cannot restrict columns, so one
-- line of client JavaScript was enough to become an admin and read the whole
-- team's data. Verified with scripts/verify-rls.mjs before it was removed.
--
-- Nothing in the app writes to profiles: name and avatar arrive from Google
-- through handle_new_user(), and is_admin is set by hand in the SQL editor.
drop policy if exists "profiles update own" on public.profiles;

-- Defence in depth. If a profile update policy is ever added back -- to let
-- someone edit their display name, say -- is_admin still cannot be raised from
-- the client. auth.uid() is null for the SQL editor and the service role,
-- which is the only place the flag is meant to be set.
create or replace function public.protect_is_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null then
    raise exception 'is_admin cannot be changed from the client';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_is_admin on public.profiles;
create trigger profiles_protect_is_admin
  before update on public.profiles
  for each row execute function public.protect_is_admin();

drop policy if exists "reports read own or admin" on public.reports;
create policy "reports read own or admin" on public.reports
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own" on public.reports
  for insert with check (user_id = auth.uid());

drop policy if exists "reports update own" on public.reports;
create policy "reports update own" on public.reports
  for update using (user_id = auth.uid());

drop policy if exists "reports delete own" on public.reports;
create policy "reports delete own" on public.reports
  for delete using (user_id = auth.uid());

drop policy if exists "events read own or admin" on public.deck_events;
create policy "events read own or admin" on public.deck_events
  for select using (user_id = auth.uid() or public.is_admin());

-- Insert only. Nothing updates or deletes an event: an audit trail you can
-- edit is not an audit trail.
drop policy if exists "events insert own" on public.deck_events;
create policy "events insert own" on public.deck_events
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- usage_summary: one view, two audiences.
-- security_invoker means the caller's own RLS applies while the view runs, so
-- an admin gets every row and a salesperson gets exactly their own. That is
-- what lets the admin dashboard and the personal navbar counter read the same
-- object instead of needing separate queries.
-- ---------------------------------------------------------------------------
create or replace view public.usage_summary as
select
  p.id as user_id,
  p.email,
  p.full_name,
  p.avatar_url,
  p.is_admin,
  count(*) filter (where e.action = 'report_created') as reports_created,
  count(*) filter (where e.action = 'deck_downloaded') as decks_downloaded,
  max(e.created_at) as last_activity
from public.profiles p
left join public.deck_events e on e.user_id = p.id
group by p.id, p.email, p.full_name, p.avatar_url, p.is_admin;

alter view public.usage_summary set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Confirmation. Expect three rows back.
-- ---------------------------------------------------------------------------
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles','reports','deck_events')
order by table_name;
