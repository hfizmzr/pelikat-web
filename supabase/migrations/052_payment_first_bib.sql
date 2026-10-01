-- ── PAYMENT-FIRST BIB ALLOCATION ──────────────────────────────
-- Previously register_for_event assigned the BIB number at
-- registration time while payment was still pending — unpaid
-- registrations burned BIB numbers and slots. Now:
--   1. Registration is created pending, with BIB NULL
--   2. Mock/real payment confirms (confirm_dummy_payment RPC)
--   3. BIB is allocated and the registration becomes paid
alter table registrations
  alter column bib_number drop not null;

-- Registration: all validation unchanged (profile, published event,
-- window, capacity, age/gender bands) — only BIB assignment removed.
create or replace function public.register_for_event(
  p_event_id uuid,
  p_category_id uuid
) returns public.registrations
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_runner_id uuid;
  v_organizer_id uuid;
  v_registration public.registrations;
  v_dob date;
  v_runner_gender text;
  v_cat_gender text;
  v_cat_min_age int;
  v_cat_max_age int;
  v_age numeric;
  v_reg_count int;
  v_cat_max_slots int;
  v_user_email text;
begin
  select id, dob, gender
  into v_runner_id, v_dob, v_runner_gender
  from public.runner_profiles
  where user_id = auth.uid();

  if v_runner_id is null then
    raise exception 'Runner profile not found';
  end if;

  if exists (
    select 1 from public.registrations
    where event_id = p_event_id and runner_id = v_runner_id
  ) then
    raise exception 'Already registered for this event';
  end if;

  select e.organizer_id, c.gender, c.min_age, c.max_age, c.max_slots
  into v_organizer_id, v_cat_gender, v_cat_min_age, v_cat_max_age, v_cat_max_slots
  from public.events e
  join public.race_categories c on c.event_id = e.id
  where e.id = p_event_id
    and c.id = p_category_id
    and e.status = 'published';

  if v_organizer_id is null then
    raise exception 'Event/category not available';
  end if;

  -- Registration window enforcement
  if exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.reg_open is not null
      and now() < e.reg_open
  ) then
    raise exception 'Registration is not yet open for this event';
  end if;

  if exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.reg_close is not null
      and now() > e.reg_close
  ) then
    raise exception 'Registration has closed for this event';
  end if;

  -- Slots are reserved at registration (pending rows hold their slot;
  -- cancel_registration frees it by deleting the row).
  select count(*) into v_reg_count
  from public.registrations
  where event_id = p_event_id and category_id = p_category_id;

  if v_reg_count >= coalesce(v_cat_max_slots, 9999) then
    raise exception 'Category is full';
  end if;

  if v_cat_min_age is not null or v_cat_max_age is not null then
    if v_dob is null then
      raise exception 'Complete your profile date of birth before registering';
    end if;

    v_age := date_part('year', age(current_date, v_dob));

    if v_cat_min_age is not null and v_age < v_cat_min_age then
      raise exception 'You do not meet the minimum age requirement for this category';
    end if;

    if v_cat_max_age is not null and v_age > v_cat_max_age then
      raise exception 'You do not meet the maximum age requirement for this category';
    end if;
  end if;

  if v_cat_gender is not null and v_cat_gender in ('M', 'F') then
    if v_runner_gender is null or v_runner_gender != v_cat_gender then
      raise exception 'This category is restricted to a different gender';
    end if;
  end if;

  insert into public.registrations (
    runner_id,
    event_id,
    category_id,
    organizer_id,
    bib_number,
    payment_status
  )
  values (
    v_runner_id,
    p_event_id,
    p_category_id,
    v_organizer_id,
    null,
    'pending'
  )
  returning * into v_registration;

  select email into v_user_email
  from auth.users where id = auth.uid();

  insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
  values (
    auth.uid(),
    'runner_registered',
    v_registration.id,
    jsonb_build_object(
      'event_id', p_event_id,
      'category_id', p_category_id
    ),
    v_user_email
  );

  return v_registration;
end;
$$;

-- Payment confirmation: now also allocates the BIB (this is the only
-- place BIB numbers are issued). Sequential per (event_id, category),
-- silent 3-attempt retry on concurrent (event_id, bib_number)
-- collisions (UC04 exception).
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
    and runner_id = v_runner_id;

  if not found then
    raise exception 'Registration not found or not yours';
  end if;

  if v_reg.payment_status = 'paid' then
    raise exception 'Payment already confirmed';
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
