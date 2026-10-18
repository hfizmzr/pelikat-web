-- ── ONE REGISTRATION PER RUNNER PER EVENT (UC11) ──────────────
-- Remove any legacy duplicates, keeping the earliest registration
-- (id as tie-breaker for identical created_at).
delete from registrations r
using registrations dup
where r.event_id = dup.event_id
  and r.runner_id = dup.runner_id
  and r.runner_id is not null
  and r.event_id is not null
  and (r.created_at, r.id) > (dup.created_at, dup.id);

alter table registrations
  add constraint registrations_event_runner_unique
  unique (event_id, runner_id);
