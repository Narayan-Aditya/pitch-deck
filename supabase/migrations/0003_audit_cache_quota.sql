-- Stop paying twice for the same Instagram account, and cap what each person
-- can spend in a month.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query
--   Paste this whole file, Run. It ends by listing the two tables it makes.
--
-- Run 0001_init.sql and 0002_slides_export.sql first. Like those, this is safe
-- to run more than once.

-- ---------------------------------------------------------------------------
-- audit_cache
--
-- browse2api bills per lookup and nothing was caching it, so two people
-- pitching the same prospect in the same week paid twice, and so did one person
-- opening the same report twice.
--
-- Keyed on (platform, handle) with the handle lowercased and stripped of a
-- leading @, so @HouseOfSarkar and houseofsarkar are one row rather than two.
-- `payload` is the lookup's response verbatim: whatever the report page read
-- last week it reads today, with no reshaping in between.
--
-- Staleness is decided in the application from AUDIT_CACHE_TTL_DAYS rather than
-- here, so changing how much you spend is an env var and a redeploy instead of
-- a migration.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_cache (
  platform   text not null check (platform in ('instagram', 'youtube')),
  handle     text not null,
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (platform, handle)
);

create index if not exists audit_cache_fetched_idx
  on public.audit_cache (fetched_at desc);

-- ---------------------------------------------------------------------------
-- lookup_events -- what the monthly allowance is counted from.
--
-- Separate from deck_events on purpose. That table is inserted by the browser
-- under RLS; this one is written only by the server with the service_role key.
-- A quota is a limit on spending, so the ledger it is computed from must not be
-- something the browser can write.
--
-- Only *paid* lookups land here. A cache hit costs nothing, so it must not
-- consume anyone's allowance -- see lib/quota.js.
-- ---------------------------------------------------------------------------
create table if not exists public.lookup_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null check (platform in ('instagram', 'youtube')),
  handle     text not null,
  created_at timestamptz not null default now()
);

create index if not exists lookup_events_user_month_idx
  on public.lookup_events (user_id, platform, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security.
--
-- audit_cache gets RLS on with no policies at all, which is the intent rather
-- than an oversight: anon and authenticated can do nothing, and only the
-- service_role key -- which bypasses RLS and lives solely in the server's
-- environment -- can read or write. Nothing in a browser should reach it.
--
-- lookup_events is readable so a person can see their own allowance and an
-- admin the team's, but has deliberately no insert/update/delete policy for the
-- reason above.
-- ---------------------------------------------------------------------------
alter table public.audit_cache   enable row level security;
alter table public.lookup_events enable row level security;

drop policy if exists "lookups read own or admin" on public.lookup_events;
create policy "lookups read own or admin" on public.lookup_events
  for select using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- usage_summary gains the month's paid lookups.
--
-- Still security_invoker, so an admin sees every row and everyone else sees
-- exactly their own -- that property is what lets the admin table and the
-- navbar counter read the same object. Scoped to the calendar month because
-- that is what the allowance resets on. `create or replace view` cannot add a
-- column in the middle, so the view is dropped first.
-- ---------------------------------------------------------------------------
drop view if exists public.usage_summary;

create view public.usage_summary as
select
  p.id as user_id,
  p.email,
  p.full_name,
  p.avatar_url,
  p.is_admin,
  count(*) filter (where e.action = 'report_created')  as reports_created,
  count(*) filter (where e.action = 'deck_downloaded') as decks_downloaded,
  count(*) filter (where e.action = 'slides_exported') as slides_exported,
  (select count(*) from public.lookup_events l
     where l.user_id = p.id
       and l.platform = 'instagram'
       and l.created_at >= date_trunc('month', now()))  as lookups_this_month,
  max(e.created_at) as last_activity
from public.profiles p
left join public.deck_events e on e.user_id = p.id
group by p.id, p.email, p.full_name, p.avatar_url, p.is_admin;

alter view public.usage_summary set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Housekeeping. Nothing expires rows automatically -- the app ignores anything
-- past the TTL and overwrites on the next lookup. Run this by hand if the table
-- ever grows enough to matter; at one row per prospect that will take a while.
--
--   delete from public.audit_cache where fetched_at < now() - interval '90 days';
-- ---------------------------------------------------------------------------

select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('audit_cache', 'lookup_events')
order by table_name;
