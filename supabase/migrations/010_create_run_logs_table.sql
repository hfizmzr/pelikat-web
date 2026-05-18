-- ── RUN LOGS (virtual run) ─────────────────────────────────────
create table run_logs (
  id           uuid primary key default gen_random_uuid(),
  runner_id    uuid references runner_profiles(id),
  event_id     uuid references events(id),
  distance_km  numeric(6,3),
  duration_sec int,
  pace_min_km  numeric(5,2),
  gps_data     jsonb,
  logged_at    timestamptz default now()
);
