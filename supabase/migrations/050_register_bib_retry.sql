-- ── BIB-CONFLICT RETRY (UC04 exception) ───────────────────────
-- Re-creates register_for_event with a retry loop around BIB
-- assignment: on a concurrent unique collision on (event_id,
-- bib_number), recompute the next available number and insert
-- silently (up to 3 attempts). Duplicate-runner violations are
-- surfaced as the friendly message instead of retrying.
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
  v_prefix text;
  v_start int;
  v_max_slots int;
  v_last_number int;
  v_next_number int;
  v_width int;
  v_bib text;
  v_registration public.registrations;
  v_dob date;
  v_runner_gender text;
  v_cat_gender text;
  v_cat_min_age int;
  v_cat_max_age int;
  v_age numeric;
  v_reg_count int;
  v_user_email text;
  v_attempt int;
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

  select e.organizer_id, c.bib_prefix, c.bib_start, c.max_slots,
         c.gender, c.min_age, c.max_age
  into v_organizer_id, v_prefix, v_start, v_max_slots,
       v_cat_gender, v_cat_min_age, v_cat_max_age
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

  v_start := coalesce(v_start, 1);
  v_max_slots := coalesce(v_max_slots, 9999);

  select count(*) into v_reg_count
  from public.registrations
  where event_id = p_event_id and category_id = p_category_id;

  if v_reg_count >= v_max_slots then
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

  v_last_number := v_start + v_max_slots - 1;

  -- BIB assignment with silent retry on concurrent collisions
  for v_attempt in 1..3 loop
    select coalesce(max(
      nullif(regexp_replace(bib_number, '\D', '', 'g'), '')::int
    ), v_start - 1) + 1
    into v_next_number
    from public.registrations
    where event_id = p_event_id
      and category_id = p_category_id;

    if v_next_number > v_last_number then
      raise exception 'Category is full';
    end if;

    v_width := length(v_last_number::text);
    v_bib := coalesce(v_prefix, '') || lpad(v_next_number::text, v_width, '0');

    begin
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
        v_bib,
        'pending'
      )
      returning * into v_registration;
      exit;
    exception
      when unique_violation then
        if position('registrations_event_runner_unique' in sqlerrm) > 0 then
          raise exception 'Already registered for this event';
        end if;
        -- BIB collision: loop recomputes the next number and retries
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
    'runner_registered',
    v_registration.id,
    jsonb_build_object(
      'event_id', p_event_id,
      'bib_number', v_bib,
      'category_id', p_category_id
    ),
    v_user_email
  );

  return v_registration;
end;
$$;
