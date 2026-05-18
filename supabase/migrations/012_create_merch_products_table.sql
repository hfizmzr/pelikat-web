-- ── MERCH PRODUCTS ───────────────────────────────────────────
create table merch_products (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references events(id),
  organizer_id uuid references organizers(id),
  name         text not null,
  description  text,
  price        numeric(10,2),
  is_active    boolean default true,
  created_at   timestamptz default now()
);
