-- ── RACE CATEGORIES ────────────────────────────────────────────
create table race_categories (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references events(id) on delete cascade,
  organizer_id  uuid references organizers(id) on delete cascade,
  name          text not null,
  gender        text,
  min_age       int,
  max_age       int,
  bib_prefix    text,
  bib_start     int default 1,
  max_slots     int,
  price         numeric(10,2) default 0
);
