-- ── MERCH ORDER ITEMS ────────────────────────────────────────
create table merch_order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references merch_orders(id) on delete cascade,
  variant_id uuid references merch_variants(id),
  quantity   int not null,
  unit_price numeric(10,2)
);
