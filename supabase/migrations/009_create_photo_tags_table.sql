-- ── PHOTO TAGS (written by Django AI worker) ──────────────────
create table photo_tags (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references events(id),
  organizer_id uuid references organizers(id),
  storage_path text not null,
  bib_number   text,
  confidence   numeric(5,4),
  status       text default 'auto'
    check (status in ('auto','review','discarded','confirmed')),
  batch_id     uuid,
  created_at   timestamptz default now()
);
