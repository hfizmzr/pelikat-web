-- ── EVENTS ─────────────────────────────────────────────────────
create table events (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid references organizers(id) on delete cascade,
  name          text not null,
  description   text,
  event_date    date not null,
  location      text,
  status        text default 'draft'
    check (status in ('draft','published','closed')),
  created_at    timestamptz default now()
);
