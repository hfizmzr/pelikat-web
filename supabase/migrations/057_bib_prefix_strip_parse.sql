-- 056 already applied; re-apply confirm_dummy_payment so BIB digits are parsed
-- with the bib_prefix stripped first (numeric prefixes would otherwise
-- inflate the sequence). Includes the 056 FOR UPDATE lock.
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
    and runner_id = v_runner_id
  for update;

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
