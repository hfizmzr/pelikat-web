-- ── RUNNER BADGES ─────────────────────────────────────────────
create table runner_badges (
  id           uuid primary key default gen_random_uuid(),
  runner_id    uuid references runner_profiles(id),
  event_id     uuid references events(id),
  badge_key    text not null,
  awarded_at   timestamptz default now(),
  unique (runner_id, badge_key, event_id)
);
