-- ── LOCK DOWN DJANGO SYSTEM TABLES (093) ─────────────────────
-- pelikat-api's `manage.py migrate` (django.contrib.auth +
-- contenttypes) created 8 tables in `public`. Supabase's default
-- privileges grant anon/authenticated full CRUD on new public tables,
-- and RLS was off, so anyone with the anon key could read/insert/
-- update/delete them via /rest/v1/auth_user etc. auth_user also has a
-- `password` column (advisor: sensitive_columns_exposed).
--
-- Fix: enable RLS with NO policies (deny-all for anon/authenticated)
-- and revoke their table privileges as a second layer.
--
-- Django is unaffected: it connects via DATABASE_URL as `postgres`,
-- which owns these tables and has BYPASSRLS. The web app never reads
-- them. The resulting "RLS enabled, no policy" INFO lint is intended.

do $$
declare
  t text;
begin
  foreach t in array array[
    'auth_user',
    'auth_group',
    'auth_permission',
    'auth_group_permissions',
    'auth_user_groups',
    'auth_user_user_permissions',
    'django_content_type',
    'django_migrations'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
