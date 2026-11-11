-- ── RACE-DAY SCHEDULE COLUMNS (092) ─────────────────────────
-- FR-54 race-day schedule display: organizers can publish the
-- on-the-day timetable for a physical event without overloading
-- event_date. Three NULL-able time columns on public.events:
--   start_time     — venue opens / bib pick-up & assembly start
--   flag_off_time  — the race itself starts (first wave sent off)
--   cutoff_time    — course closes / timing stops
-- All NULL-able, no defaults: an event with no published schedule
-- stays NULL and the UI simply hides the race-day section. Virtual
-- events have no flag-off and are expected to remain NULL.
--
-- FORWARD-ONLY: no down-migration is provided (repo convention).
-- Idempotent — safe to re-run (ADD COLUMN IF NOT EXISTS +
-- COMMENT ON COLUMN are both re-runnable).
--
-- No triggers, no RLS changes: the new columns live on public.events
-- and inherit its existing row-level security unchanged.

alter table public.events add column if not exists start_time time null;
alter table public.events add column if not exists flag_off_time time null;
alter table public.events add column if not exists cutoff_time time null;

comment on column public.events.start_time is
  'Race-day schedule: venue opens / bib pick-up and assembly start (NULL = not published).';
comment on column public.events.flag_off_time is
  'Race-day schedule: the race starts — first flag-off wave (NULL = not published).';
comment on column public.events.cutoff_time is
  'Race-day schedule: course closes / timing stops (NULL = not published).';
