-- Remember every brand somebody looked up, and keep watching it for news.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query
--   Paste this whole file, Run. It ends by listing the two tables it makes.
--
-- Run 0001-0004 first. Like those, safe to run more than once.
--
-- WHY
--   A prospect looked up on Tuesday is forgotten by Friday. The pitch-deck page
--   scrapes a brand, shows what it found and throws it away unless a deck is
--   actually exported -- so the one thing worth keeping, "we are interested in
--   this brand", is the thing that was never written down.
--
--   Two tables, because the two halves have completely different shapes. Who is
--   watching what is small, personal and changes when a person acts.  What the
--   trade press said is large, shared by everyone, and arrives on its own.

-- ---------------------------------------------------------------------------
-- watched_brands -- one row per person per brand they looked up.
--
-- Written by the browser on a successful lookup, not on export: wanting to know
-- more about a brand is the signal, and most lookups never become a deck.
--
-- brand_key is the join to feed_archive below and the reason a person cannot
-- end up with "Mamaearth" and "mamaearth " as two rows. It is computed in the
-- application (lib/prospectsVocab.js, brandKey) rather than here, so the two
-- sides can never disagree about what a key is -- generating it in SQL would
-- mean maintaining the same normalisation twice, in two languages.
--
-- site_url is whatever was pasted. Kept so the History page can offer a rebuild
-- without asking for the address a second time, and so a name that turns out to
-- be ambiguous can still be told apart.
-- ---------------------------------------------------------------------------
create table if not exists public.watched_brands (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  brand_key      text not null,
  brand_name     text not null,
  site_url       text,
  -- What the scrape found, verbatim. The History page shows a brand's details
  -- without re-scraping -- and without spending a lookup to do it.
  brand_data     jsonb not null default '{}'::jsonb,
  search_count   integer not null default 1,
  first_searched timestamptz not null default now(),
  last_searched  timestamptz not null default now(),
  -- Moved forward when the person opens the brand in History. Anything in
  -- feed_archive newer than this is what "3 new updates" counts.
  updates_seen_at timestamptz,
  unique (user_id, brand_key)
);

create index if not exists watched_brands_user_idx
  on public.watched_brands (user_id, last_searched desc);

-- ---------------------------------------------------------------------------
-- feed_archive -- what the trade press has said, kept.
--
-- The RSS feeds carry roughly the last fifty items each, which is a few days.
-- Without somewhere to put them, "updates for this brand" could only ever mean
-- "updates this week", and a History page that forgets is not history.
--
-- Filled as a side effect of the home page's prospect feed: every poll writes
-- what it parsed. So the archive grows whenever anyone uses the app, and needs
-- no cron to keep it going. It does start empty -- there is no backfill,
-- because the feeds themselves do not go back.
--
-- Shared by everyone. The news is not anyone's private data, and one archive
-- read by all is what lets a brand somebody else looked up already have history
-- the first time you look it up.
--
-- item_url is the natural key: the same story polled twenty times is one row,
-- and the same story reported by two outlets is two, which is correct -- they
-- are two independent confirmations.
-- ---------------------------------------------------------------------------
create table if not exists public.feed_archive (
  id           bigserial primary key,
  brand_key    text not null,
  brand_name   text not null,
  -- Named signal_type, not "trigger": TRIGGER is a SQL keyword, and a column
  -- that needs quoting in half the places it appears is a trap for whoever
  -- writes the next query by hand.
  signal_type  text not null,
  reason       text not null,
  item_url     text not null unique,
  source       text not null,
  published_at timestamptz,
  archived_at  timestamptz not null default now()
);

-- The only query this table serves: "everything about these brands, newest
-- first". Both columns, in that order, because the filter is always by key.
create index if not exists feed_archive_brand_idx
  on public.feed_archive (brand_key, published_at desc);

-- Used by the pruning statement at the bottom of this file.
create index if not exists feed_archive_archived_idx
  on public.feed_archive (archived_at);

-- ---------------------------------------------------------------------------
-- Row level security.
-- ---------------------------------------------------------------------------
alter table public.watched_brands enable row level security;
alter table public.feed_archive   enable row level security;

-- Same shape as the policies on reports: your own rows, plus everything for an
-- admin, so the Team usage page can show what a colleague is tracking.
drop policy if exists "watched read own or admin" on public.watched_brands;
create policy "watched read own or admin" on public.watched_brands
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "watched insert own" on public.watched_brands;
create policy "watched insert own" on public.watched_brands
  for insert with check (user_id = auth.uid());

-- Deliberately NOT "or is_admin()": an admin may read what a colleague is
-- tracking, but editing or deleting someone else's watchlist is not a thing
-- this app should be able to do.
drop policy if exists "watched update own" on public.watched_brands;
create policy "watched update own" on public.watched_brands
  for update using (user_id = auth.uid());

drop policy if exists "watched delete own" on public.watched_brands;
create policy "watched delete own" on public.watched_brands
  for delete using (user_id = auth.uid());

-- feed_archive gets RLS on and NO policies at all, exactly like audit_cache in
-- 0003. That is not an oversight: it means the service_role key is the only
-- thing that can read or write it, so the archive is reached through the
-- server's /api/history route and never directly from a browser. The route is
-- what scopes an answer to the brands the caller is actually watching.

-- ---------------------------------------------------------------------------
-- Keeping the archive from growing forever.
--
-- Not a cron -- Supabase's scheduler is an extension this project does not
-- assume. Run this by hand every few months, or wire it into pg_cron if the row
-- count ever becomes interesting. A year of three feeds is on the order of tens
-- of thousands of rows, so this is housekeeping, not urgency.
--
--   delete from public.feed_archive
--   where archived_at < now() - interval '18 months';
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Confirmation. Expect two rows back.
-- ---------------------------------------------------------------------------
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('watched_brands', 'feed_archive')
order by table_name;
