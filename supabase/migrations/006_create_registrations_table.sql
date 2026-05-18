-- ── REGISTRATIONS ─────────────────────────────────────────────
create table registrations (
  id              uuid primary key default gen_random_uuid(),
  runner_id       uuid references runner_profiles(id),
  event_id        uuid references events(id),
  category_id     uuid references race_categories(id),
  organizer_id    uuid references organizers(id),
  bib_number      text not null,
  payment_status  text default 'pending'
    check (payment_status in ('pending','paid','refunded')),
  checked_in      boolean default false,
  checked_in_at   timestamptz,
  created_at      timestamptz default now(),
  unique (event_id, bib_number)
);
