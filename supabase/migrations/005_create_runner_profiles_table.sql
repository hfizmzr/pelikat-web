-- ── RUNNER PROFILES ────────────────────────────────────────────
create table runner_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade unique,
  full_name     text,
  phone         text,
  dob           date,
  gender        text check (gender in ('M','F')),
  ic_encrypted  text,
  t_shirt_size  text,
  pdpa_agreed   boolean default false,
  created_at    timestamptz default now()
);
