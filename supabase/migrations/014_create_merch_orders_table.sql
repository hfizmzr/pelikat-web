-- ── MERCH ORDERS ─────────────────────────────────────────────
create table merch_orders (
  id           uuid primary key default gen_random_uuid(),
  runner_id    uuid references runner_profiles(id),
  organizer_id uuid references organizers(id),
  total_amount numeric(10,2),
  payment_ref  text,
  status       text default 'pending'
    check (status in ('pending','paid','shipped','cancelled')),
  created_at   timestamptz default now()
);
