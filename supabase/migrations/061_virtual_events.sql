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
    select coalesce(max(
      nullif(regexp_replace(bib_number, '\D', '', 'g'), '')::int
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

-- ── PAYMENT CONFIRMATION: no bib for virtual events ───────────
-- Same as 056 but the bib allocation step is skipped when the event
-- is virtual — payment still marks the registration paid.
create or replace function public.confirm_dummy_payment(
  p_registration_id uuid
) returns boolean
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_runner_id uuid;
  v_reg record;
  v_cat record;
  v_event_type text;
  v_user_email text;
  v_last_number int;
  v_next_number int;
  v_width int;
  v_bib text;
  v_attempt int;
begin
  select id into v_runner_id
  from public.runner_profiles
  where user_id = auth.uid();

  if v_runner_id is null then
    raise exception 'Runner profile not found';
  end if;

  select * into v_reg
  from public.registrations
  where id = p_registration_id
    and runner_id = v_runner_id
  for update;

  if not found then
    raise exception 'Registration not found or not yours';
  end if;

  if v_reg.payment_status = 'paid' then
    raise exception 'Payment already confirmed';
  end if;

  select event_type into v_event_type
  from public.events
  where id = v_reg.event_id;

  if v_event_type = 'virtual' then
    update public.registrations
    set payment_status = 'paid'
    where id = p_registration_id;

    select email into v_user_email
    from auth.users where id = auth.uid();

    insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
    values (
      auth.uid(),
      'payment_confirmed',
      p_registration_id,
      jsonb_build_object(
        'event_id', v_reg.event_id,
        'bib_number', null
      ),
      v_user_email
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
    select coalesce(max(
      nullif(regexp_replace(bib_number, '\D', '', 'g'), '')::int
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

  select email into v_user_email
  from auth.users where id = auth.uid();

  insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
  values (
    auth.uid(),
    'payment_confirmed',
    p_registration_id,
    jsonb_build_object(
      'event_id', v_reg.event_id,
      'bib_number', v_bib
    ),
    v_user_email
  );

  return true;
end;
$$;
