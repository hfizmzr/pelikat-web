-- ── PHOTO TAGS: TIGHTEN RUNNER READS ─────────────────────────
-- "runner sees own photos" matched on bib_number against ANY of the
-- runner's registrations, across every event and every status. A runner
-- with bib 1234 in event A could read event B's bib-1234 rows, including
-- review / discarded tags and their storage paths.
--
-- Scope it to the runner's own tagged rows that are visible in the gallery
-- (auto / confirmed) — the same rule the "runner reads tagged race photos"
-- storage policy and the runner gallery query already use.
-- runner_request_photo_review() is SECURITY DEFINER, so it is unaffected.

drop policy if exists "runner sees own photos" on public.photo_tags;

create policy "runner sees own photos" on public.photo_tags
  for select using (
    runner_id = public.my_runner_id()
    and status in ('auto', 'confirmed')
  );
