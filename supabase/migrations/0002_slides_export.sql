-- Adds the third thing worth counting: a deck pushed straight into Google
-- Slides, rather than downloaded as a .pptx.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query
--   Open this file, Ctrl+A, Ctrl+C, paste into the editor, Run.
--   It should finish by listing the three allowed actions.
--
-- Run 0001_init.sql first if this is a fresh project. Like that one, this is
-- safe to run more than once.

-- ---------------------------------------------------------------------------
-- deck_events.action: allow 'slides_exported'.
--
-- 0001 declared the check inline, so Postgres named it itself — normally
-- deck_events_action_check. There is no "alter constraint" for a check, so it
-- has to be dropped and re-added.
--
-- Dropping it by that guessed name would be a trap: if Postgres picked a
-- different one, `drop ... if exists` quietly does nothing, the new constraint
-- is added alongside the old, and inserts still fail — with the migration
-- reporting success. So every check constraint on this table mentioning
-- `action` is looked up and dropped by its real name instead.
--
-- Existing rows all hold one of the two old values, so the new constraint
-- validates against them without a rewrite.
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'deck_events'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%action%'
  loop
    execute format('alter table public.deck_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.deck_events
  add constraint deck_events_action_check
  check (action in ('report_created', 'deck_downloaded', 'slides_exported'));

-- ---------------------------------------------------------------------------
-- usage_summary: same view, one more counter.
--
-- Still security_invoker, so an admin sees every row and everyone else sees
-- exactly their own — that property is what lets the admin table and the
-- personal counter read the same object. `create or replace view` cannot add a
-- column in the middle, so the new count goes last and the view is dropped
-- first to keep this re-runnable after a column order change.
-- ---------------------------------------------------------------------------
drop view if exists public.usage_summary;

create view public.usage_summary as
select
  p.id as user_id,
  p.email,
  p.full_name,
  p.avatar_url,
  p.is_admin,
  count(*) filter (where e.action = 'report_created') as reports_created,
  count(*) filter (where e.action = 'deck_downloaded') as decks_downloaded,
  count(*) filter (where e.action = 'slides_exported') as slides_exported,
  max(e.created_at) as last_activity
from public.profiles p
left join public.deck_events e on e.user_id = p.id
group by p.id, p.email, p.full_name, p.avatar_url, p.is_admin;

alter view public.usage_summary set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Confirm what the constraint now allows. The definition it prints should
-- include slides_exported.
-- ---------------------------------------------------------------------------
select conname as constraint_name, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'deck_events_action_check';
