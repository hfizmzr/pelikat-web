-- ── VIRTUAL EVENTS ────────────────────────────────────────────
-- Virtual runs live on the same `events` table but skip venue-only
-- modules (location optional, no race-kit collection) and never get
-- physical BIB numbers — participants submit run_logs and earn an
-- E-Certificate on reaching the event's target distance.

alter table events
  add column if not exists event_type text not null default 'physical'
    check (event_type in ('physical','virtual')),
  add column if not exists target_distance_km numeric(6,2);

-- ── BIB ALLOCATION: skip virtual events (no physical bib) ─────
create or replace function public.allocate_bib(p_registration_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg record;
  v_cat record;
  v_event_type text;
  v_last_number int;
  v_next_number int;
  v_width int;
  v_bib text;
  v_attempt int;
begin
  select * into v_reg
  from public.registrations
  where id = p_registration_id
    and bib_number is null
  for update;

  if not found then
    return null;
  end if;

  select event_type into v_event_type
  from public.events
  where id = v_reg.event_id;

  if v_event_type = 'virtual' then
    -- Virtual runs have no physical bib; nothing to allocate
    return null;
  end if;

  select bib_prefix, bib_start, max_slots
  into v_cat
  from public.race_categories
  where id = v_reg.category_id;

  v_cat.bib_start := coalesce(v_cat.bib_start, 1);
  v_cat.max_slots := coalesce(v_cat.max_slots, 9999);
  v_last_number := v_cat.bib_start + v_cat.max_slots - 1;
  v_width := length(v_last_number::text);

  for v_attempt in 1..3 loop
    -- Strip the category's bib_prefix before parsing digits: a numeric
    -- prefix (bib_prefix is free text) would otherwise inflate v_next_number.
    select coalesce(max(
      nullif(regexp_replace(substr(bib_number, length(coalesce(v_cat.bib_prefix, '')) + 1), '\D', '', 'g'), '')::int
    ), v_cat.bib_start - 1) + 1
    into v_next_number
    from public.registrations
    where event_id = v_reg.event_id
      and category_id = v_reg.category_id;

    if v_next_number > v_last_number then
      raise exception 'Category is full';
    end if;

    v_bib := coalesce(v_cat.bib_prefix, '') || lpad(v_next_number::text, v_width, '0');

    begin
      update public.registrations
      set bib_number = v_bib
      where id = p_registration_id;
      exit;
    exception
      when unique_violation then
        -- BIB collision: retry with the next available number
        if v_attempt = 3 then
          raise exception 'Could not assign BIB, please try again';
        end if;
    end;
  end loop;

  return v_bib;
end;
$$;

-- ── ACLs ─────────────────────────────────────────────────────
-- Internal-only: allocate_bib is called by the definer functions
-- below (066) and confirm_dummy_payment (067), never by clients.
revoke execute on function public.allocate_bib(uuid) from public, anon, authenticated;
grant execute on function public.allocate_bib(uuid) to service_role;

-- ── PAYMENT CONFIRMATION: server-trusted caller + virtual skip ─
-- Renumbered from the branch's 061 to 067 (collision with main's
-- HitPay migrations). The body is main's newest confirm_dummy_payment
-- (from 061_confirm_dummy_payment_server_trust.sql) verbatim —
-- service-role only, ownership enforced app-side in src/lib/actions/
-- payments.ts, FOR UPDATE row lock, bib_prefix-strip digit parse,
-- 3-attempt BIB retry, atomic payment_status='paid' + BIB assignment,
-- audit_log entry with NULL actor (service_role JWTs carry no sub) —
-- with one early-return branch: virtual events mark the registration
-- paid and audit payment_confirmed with NO bib allocation.
create or replace function public.confirm_dummy_payment(
  p_registration_id uuid
) returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_reg record;
  v_cat record;
  v_event_type text;
  v_last_number int;
  v_next_number int;
  v_width int;
  v_bib text;
  v_attempt int;
begin
  select * into v_reg
  from public.registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception 'Registration not found or not yours';
  end if;

  -- Both paid AND waived are already-confirmed states: a waived
  -- (complimentary) registration is not payable and must never be
  -- overwritten to 'paid' through the mock payment flow.
  if v_reg.payment_status in ('paid','waived') then
    raise exception 'Payment already confirmed';
  end if;

  select event_type into v_event_type
  from public.events
  where id = v_reg.event_id;

  if v_event_type = 'virtual' then
    -- Virtual runs have no physical bib: mark paid, audit, done.
    update public.registrations
    set payment_status = 'paid'
    where id = p_registration_id;

    -- No JWT sub on service_role callers: actor identity is NULL in
    -- mock mode (see migration header).
    insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
    values (
      null,
      'payment_confirmed',
      p_registration_id,
      jsonb_build_object(
        'event_id', v_reg.event_id,
        'bib_number', null
      ),
      null
    );

    return true;
  end if;

  select bib_prefix, bib_start, max_slots
  into v_cat
  from public.race_categories
  where id = v_reg.category_id;

  v_cat.bib_start := coalesce(v_cat.bib_start, 1);
  v_cat.max_slots := coalesce(v_cat.max_slots, 9999);
  v_last_number := v_cat.bib_start + v_cat.max_slots - 1;
  v_width := length(v_last_number::text);

  for v_attempt in 1..3 loop
    -- Strip the category's bib_prefix before parsing digits: a numeric
    -- prefix (bib_prefix is free text) would otherwise inflate v_next_number.
    select coalesce(max(
      nullif(regexp_replace(substr(bib_number, length(coalesce(v_cat.bib_prefix, '')) + 1), '\D', '', 'g'), '')::int
    ), v_cat.bib_start - 1) + 1
    into v_next_number
    from public.registrations
    where event_id = v_reg.event_id
      and category_id = v_reg.category_id;

    if v_next_number > v_last_number then
      raise exception 'Category is full';
    end if;

    v_bib := coalesce(v_cat.bib_prefix, '') || lpad(v_next_number::text, v_width, '0');

    begin
      update public.registrations
      set bib_number = v_bib,
          payment_status = 'paid'
      where id = p_registration_id;
      exit;
    exception
      when unique_violation then
        -- BIB collision: retry with the next available number
        if v_attempt = 3 then
          raise exception 'Could not assign BIB, please try again';
        end if;
    end;
  end loop;

  -- No JWT sub on service_role callers: actor identity is NULL in
  -- mock mode (see migration header).
  insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
  values (
    null,
    'payment_confirmed',
    p_registration_id,
    jsonb_build_object(
      'event_id', v_reg.event_id,
      'bib_number', v_bib
    ),
    null
  );

  return true;
end;
$$;

-- ── ACLs (belt-and-braces; same as main's 060/061) ───────────
revoke execute on function public.confirm_dummy_payment(uuid) from public;
revoke execute on function public.confirm_dummy_payment(uuid) from anon;
revoke execute on function public.confirm_dummy_payment(uuid) from authenticated;
grant execute on function public.confirm_dummy_payment(uuid) to service_role;

comment on function public.confirm_dummy_payment(uuid)
  is 'mock-mode confirm; ownership enforced app-side; no auth.uid() check since main''s 061 (service_role callers only); virtual events confirm with no BIB since 067';
