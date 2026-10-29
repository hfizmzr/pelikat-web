-- ── PUBLIC READS CLOSED EVENTS (Event Themes P3 — spec §12.3, plan Task 2) ──
-- 019 created the anon SELECT policy "public reads published events"
--   USING (status = 'published').
-- spec §12.1 "Visibility: public reads `published`/`closed`; drafts
-- owner/admin-only" (lh. 81) makes closed events publicly readable too, so
-- the policy is recreated (drop + create, SAME NAME — downstream deps and
-- the §12 visibility matrix reference it) with the widened USING clause.
--
-- Safety argument (review-focus item 1): PostgREST row-level policies
-- cannot be column-scoped, so anon now reads FULL event ROWS of closed
-- events. That is acceptable only if no protected/PII column is exposed on
-- \d events — verified locally (columns: id, organizer_id, name,
-- description, event_date, location, status, created_at, reg_open,
-- reg_close, results_published, event_type, target_distance_km,
-- theme_preset_id, theme_config, slug): no contact_email / organizer
-- identity text lives on the row; organizer_id is an opaque FK (its
-- organizer name resolve stays a SEPARATE service-role read AFTER the
-- visibility check, per plan Task 5, and host correlations are withheld
-- from anonymous callers). Public `/events/[slug]` page (Task 5) therefore
-- renders from an EXPLICIT column list (id, name, slug, event_date,
-- location, status + counts) and never selects description-attachment
-- columns the widened row blanket would technically serve today.
-- Drafts stay hidden: status `draft` is not in the USING list, and the
-- `organizer reads own events` policy (019) is untouched, so the
-- owner/admin path is unchanged (verified in the Task 2 report matrix).

-- ══ up ════════════════════════════════════════════════════════════════
drop policy if exists "public reads published events" on public.events;

create policy "public reads published events" on public.events
  for select using (status in ('published', 'closed'));

-- ══ down ══════════════════════════════════════════════════════════════
-- Restore the narrower 019-era published-only policy (same name):
-- drop policy if exists "public reads published events" on public.events;
-- create policy "public reads published events" on public.events
--   for select using (status = 'published');
