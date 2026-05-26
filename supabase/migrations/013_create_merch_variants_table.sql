-- ── MERCH VARIANTS ───────────────────────────────────────────
create table merch_variants (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references merch_products(id) on delete cascade,
  size         text,
  color        text,
  stock        int default 0
);
