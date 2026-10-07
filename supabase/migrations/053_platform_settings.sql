-- ── ADMIN FEATURE FLAGS / PLATFORM SETTINGS ──────────────────
-- Backing table for /api/admin/settings and the admin settings UI
-- (platform_name, support_email, feature flags, maintenance_mode).
-- jsonb value per key.

create table if not exists platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table platform_settings enable row level security;

create policy "admin manages platform_settings" on platform_settings
  for all using (is_admin());

insert into platform_settings (key, value)
values
  ('platform_name', '"Pelikat Running Platform"'::jsonb),
  ('support_email', '"support@pelikat.com"'::jsonb),
  ('feature_virtual_run', 'true'::jsonb),
  ('feature_photo_ai', 'true'::jsonb),
  ('feature_repc_collection', 'true'::jsonb),
  ('maintenance_mode', 'false'::jsonb)
on conflict (key) do nothing;
