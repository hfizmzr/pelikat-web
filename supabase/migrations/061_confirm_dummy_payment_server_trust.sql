-- ── CONFIRM_DUMMY_PAYMENT: SERVER-TRUSTED CALLER (061) ────────
-- WHY the runner-ownership (auth.uid()) check was dropped:
--
-- Mock payment mode is the only path through this RPC, and since 060
-- only service_role may execute it. service_role JWTs carry NO sub
-- claim, so auth.uid() always evaluates to NULL inside the function
-- and 056's ownership check made EVERY service-role call fail with
-- 'Runner profile not found'. Ownership verification instead moved to
-- the application layer: the server action (src/lib/actions/
-- payments.ts) MUST:
--   1. throw unless the SERVER env sets PAYMENT_PROVIDER = 'mock';
--   2. verify the caller's registration ownership using the caller's
--      own JWT (auth server client / RLS-backed select) BEFORE
--      invoking this RPC with the service-role client.
-- So the function is a service-side primitive, not a user-facing
-- authorization boundary. Body below is otherwise byte-equivalent to
-- 056: security definer, empty search_path, FOR UPDATE row lock,
-- bib_prefix-strip digit parse, 3-attempt BIB retry, atomic
-- payment_status='paid' + BIB assignment, audit_log entry.
--
-- ACLs: re-assert 060's grants explicitly (they survive CREATE OR
-- REPLACE, but keep the contract inlined for review).

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

-- ── ACLs (belt-and-braces; same as 060) ──────────────────────
revoke execute on function public.confirm_dummy_payment(uuid) from public;
revoke execute on function public.confirm_dummy_payment(uuid) from anon;
revoke execute on function public.confirm_dummy_payment(uuid) from authenticated;
grant execute on function public.confirm_dummy_payment(uuid) to service_role;

comment on function public.confirm_dummy_payment(uuid)
  is 'mock-mode confirm; ownership enforced app-side; no auth.uid() check since 061 (service_role callers only)';
