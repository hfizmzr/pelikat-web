-- ── ORGANIZERS (tenants) ───────────────────────────────────────
create table organizers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text unique not null,
  contact_email text unique,
  is_active    boolean default true,
  sub_expires_at timestamptz,
  created_at   timestamptz default now()
);
