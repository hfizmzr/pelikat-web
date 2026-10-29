-- ── PUBLIC READS PUBLISHED/CLOSED EVENT CATEGORIES (Event Themes P4 — Task 6) ──
-- Problem (P3 live smoke, parked): 019 gave race_categories two select paths:
--   "organizer manages categories" (owner) and "runner sees categories for
--   registered events" (event_id in own registrations). Those are permissive
--   but together they are chicken-and-egg: the registration flow itself needs
--   the category list to self-register, yet a runner without a registration
--   row matches neither policy → anon/unregistered users see [] and cannot
--   start a registration. Closed events' categories are likewise invisible,
--   which breaks leaderboard/registration-history contexts.
--
-- Fix: a third permissive select policy that mirrors the events visibility
--   rule (019 "public reads published events" as widened by 082: published +
--   closed), with the admin bypass folded into the same USING clause.
-- Downstream read gates stay server-enforced — nothing here relaxes them:
--   · 045 register_for_event window/capacity checks (RPC, service path)
--   · registrations insert remains governed by its own policies
--   · "organizer manages categories" (019:23) + "runner sees categories for
--     registered events" (019:26) are UNTOUCHED.
--
-- Row-exposure argument (mirror of 082's events argument): PostgREST RLS
--   cannot be column-scoped, so anon reads FULL category rows. Acceptable —
--   race_categories columns are non-PII operational data only: name, gender,
--   min_age/max_age, bib_prefix/bib_start, max_slots, price (004 schema; no
--   contact/identity text). organizer_id is an opaque uuid FK. Draft-event
--   categories stay hidden (status 'draft' is not in the USING list) and the
--   owner path (organizer reads own events, 019:13) is unchanged.

-- ══ up ════════════════════════════════════════════════════════════════
drop policy if exists "public reads published event categories"
  on public.race_categories;

create policy "public reads published event categories" on public.race_categories
  for select using (
    exists (
      select 1 from public.events e
      where e.id = race_categories.event_id
        and e.status in ('published', 'closed')
    )
    or is_admin()
  );

-- ══ down ══════════════════════════════════════════════════════════════
-- Drop this policy ONLY — restores the 019 baseline (no public select on
-- race_categories; owner + registered-runners policies remain):
-- drop policy if exists "public reads published event categories"
--   on public.race_categories;
