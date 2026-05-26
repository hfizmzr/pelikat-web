-- ── AUDIT LOG ────────────────────────────────────────────────
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text,
  target_id   uuid,
  metadata    jsonb,
  created_at  timestamptz default now()
);
