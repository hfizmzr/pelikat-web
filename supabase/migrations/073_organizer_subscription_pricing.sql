-- ── ORGANIZER SUBSCRIPTION PRICING + PLATFORM_SETTINGS RLS REWORK ──
-- 1. RLS: platform_settings becomes publicly readable (prices / config /
--    feature flags are public display config). Writes stay admin-only.
--    Service role bypasses RLS, so migrations/seed.sql seeding is unaffected.
-- 2. Seed the single-tier organizer subscription price.
--    MONEY CONVENTION: MYR decimal (99.00 = RM99.00, sent to HitPay as
--    '99.00'). Never integer sen.
-- 3. Audit: platform_settings was NOT covered by the 032 generic trigger;
--    add a dedicated AFTER UPDATE trigger logging old -> new jsonb values.

-- ── 1. RLS REWORK ─────────────────────────────────────────────────────
drop policy if exists "admin manages platform_settings" on platform_settings;
drop policy if exists "platform settings public read" on platform_settings;
drop policy if exists "platform settings admin update" on platform_settings;

create policy "platform settings public read"
  on platform_settings for select
  to anon, authenticated
  using (true);

create policy "platform settings admin update"
  on platform_settings for update
  to authenticated
  using (is_admin())
  with check (is_admin());

-- No INSERT/DELETE policies: keys are seeded via migrations/seed.sql;
-- service role bypasses RLS for any operational needs.

-- ── 2. SEED SUBSCRIPTION PRICE ────────────────────────────────────────
insert into platform_settings (key, value)
values
  ('organizer_subscription_price',
   '{"amount": 99.00, "currency": "MYR", "period": "year", "duration_days": 365}'::jsonb)
on conflict (key) do nothing;

-- ── 3. AUDIT TRIGGER ON UPDATE ────────────────────────────────────────
-- platform_settings has a text `key`, not a uuid id, so audit_log.target_id
-- stays null and the key + old/new values go to metadata.
create or replace function audit.log_platform_setting_change()
returns trigger
language plpgsql
security definer
set search_path = public, audit
as $$
declare
  v_actor_email text;
begin
  select u.email into v_actor_email
  from auth.users u
  where u.id = auth.uid();

  insert into public.audit_log (actor_id, actor_email, action, target_id, metadata)
  values (
    auth.uid(),
    v_actor_email,
    'platform_setting_updated',
    null,
    jsonb_build_object(
      'key', new.key,
      'table', 'platform_settings',
      'operation', 'UPDATE',
      'old_value', old.value,
      'new_value', new.value
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_platform_settings on platform_settings;
create trigger audit_platform_settings
  after update on platform_settings
  for each row execute function audit.log_platform_setting_change();
