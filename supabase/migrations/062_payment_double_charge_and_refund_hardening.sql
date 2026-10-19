-- ── PAYMENT DOUBLE-CHARGE + REFUND HARDENING (062) ───────────
-- Fixes from PR review (web#23 / api#7):
--
-- W-3  confirm_payment used to complete a SECOND pending payment row
--      for an already-paid registration and silently skip the BIB
--      allocation with no signal — a runner paying twice (e.g. a
--      stale QR retry) was a silent double charge. The second charge
--      genuinely happened at HitPay, so the row must still complete
--      with truth (status='completed', provider_payment_id, rail),
--      but it is audited as 'payment_duplicate_detected' with enough
--      metadata for the platform to identify and refund it, and the
--      registration/BIB state is left untouched. The duplicate row is
--      a normal refundable payment once refunded_amount exists.
--
-- A-4  refunds need a cumulative counter: refunded_amount
--      numeric(10,2) not null default 0 on payments. Refund handlers
--      validate remaining = amount - refunded_amount and derive
--      'partially_refunded'/'refunded' from it (app-side, api repo).
--
-- A-3  create_payment's read-then-create "reuse pending" check raced:
--      two concurrent requests could mint two HitPay PRs for one
--      order. claim_payment_slot serializes with a transaction-scoped
--      advisory lock keyed on the logical order, returns the existing
--      pending row's provider_request_id if one exists (dev then GETs
--      the PR from HitPay and reuses its checkout_url — unchanged M1
--      behaviour), or creates the payments row with a SYNTHETIC
--      sentinel id and is_reservation=true. Exact usage sequence for
--      the caller (Django service, coordinated contract):
--
--        1. call claim_payment_slot(order_type, registration_id,
--           merch_order_id, organizer_id, runner_id, amount).
--        2. is_reservation = false  → an existing pending row was
--           reused: do NOT call HitPay create; GET the PR by
--           provider_request_id and reuse its checkout_url.
--        3. is_reservation = true   → fresh row with sentinel
--           provider_request_id = 'pending:<uuid>'. Call HitPay
--           create (our request carries NO DB-final PR id yet).
--             a. on success: UPDATE payments SET
--                provider_request_id = <real HitPay PR id>
--                WHERE provider_request_id = <sentinel>
--                (the UNIQUE constraint still guards real ids).
--             b. on HitPay failure: DELETE the synthetic row; the
--                next retry re-claims fresh.
--
-- ACLs: service_role only for the new RPC, same lockdown contract as
-- 059/060/061. RLS is unaffected (no new table; no new policies).

-- 1. Cumulative refund counter (A-4).
alter table public.payments
  add column if not exists refunded_amount numeric(10,2) not null default 0;

comment on column public.payments.refunded_amount
  is 'cumulative refunded total; refund handlers validate remaining = amount - refunded_amount and derive partially_refunded/refunded (A-4, since 062)';

-- 2. confirm_payment: add the duplicate-charge branch (W-3).
--    CREATE OR REPLACE of 059's current body; everything except the
--    registration already-paid branch is byte-identical. NOTE: this
--    is the 059 webhook RPC — confirm_dummy_payment (035/056/061,
--    mock mode) is a distinct function and is deliberately untouched.

create or replace function public.confirm_payment(
  p_provider_request_id text,
  p_provider_payment_id text,
  p_rail text
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_payment   public.payments;
  v_reg       record;
  v_cat       record;
  v_actor     uuid;
  v_org_email text;
  v_last_number int;
  v_next_number int;
  v_width     int;
  v_bib       text;
  v_attempt   int;
begin
  select * into v_payment
  from public.payments
  where provider_request_id = p_provider_request_id
  for update;

  if not found then
    return null;
  end if;

  -- Idempotent no-op for repeat webhooks / retries.
  if v_payment.status <> 'pending' then
    return v_payment.id;
  end if;

  -- Truth first: the charge happened at the gateway, so the row
  -- completes even in the duplicate case below.
  update public.payments
  set status = 'completed',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      payment_rail = coalesce(p_rail, payment_rail),
      updated_at = now()
  where id = v_payment.id;

  -- Audit actor: the runner behind the payment, when there is one.
  select user_id into v_actor
  from public.runner_profiles
  where id = v_payment.runner_id;

  if v_payment.order_type = 'registration' then
    if v_payment.registration_id is null then
      raise exception 'Payment % has no linked registration', v_payment.id;
    end if;

    select * into v_reg
    from public.registrations
    where id = v_payment.registration_id
    for update;

    if not found then
      raise exception 'Linked registration not found';
    end if;

    -- W-3 duplicate-charge guard: the registration was already
    -- confirmed by a previous payment. This second charge DID happen
    -- at HitPay (the UPDATE above kept its truth: completed +
    -- provider ids + rail), but we must NOT re-issue a BIB or re-touch
    -- the registration. Audit it so the platform can identify and
    -- refund the duplicate: with refunded_amount (062) this is a
    -- normal refundable payment row.
    if v_reg.payment_status = 'paid' then
      insert into public.audit_log (actor_id, action, target_id, metadata)
      values (
        v_actor,
        'payment_duplicate_detected',
        v_reg.id,
        jsonb_build_object(
          'registration_id', v_reg.id,
          'provider_request_id', v_payment.provider_request_id,
          'provider_payment_id', coalesce(p_provider_payment_id, v_payment.provider_payment_id),
          'amount', v_payment.amount,
          'currency', v_payment.currency
        )
      );
    else
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
          where id = v_reg.id;
          exit;
        exception
          when unique_violation then
            -- BIB collision: retry with the next available number
            if v_attempt = 3 then
              raise exception 'Could not assign BIB, please try again';
            end if;
        end;
      end loop;

      insert into public.audit_log (actor_id, action, target_id, metadata)
      values (
        v_actor,
        'payment_confirmed',
        v_reg.id,
        jsonb_build_object(
          'event_id', v_reg.event_id,
          'bib_number', v_bib,
          'provider', v_payment.provider,
          'provider_request_id', v_payment.provider_request_id
        )
      );
    end if;

  elsif v_payment.order_type = 'organizer_subscription' then
    if v_payment.organizer_id is null then
      raise exception 'Payment % has no linked organizer', v_payment.id;
    end if;

    -- Mirror the organizer payment page's duration: one year. Extending
    -- from the later of (current expiry, now) so early renewals do not
    -- lose remaining days.
    update public.organizers
    set sub_expires_at = greatest(coalesce(sub_expires_at, now()), now()) + interval '1 year'
    where id = v_payment.organizer_id;

    select contact_email into v_org_email
    from public.organizers
    where id = v_payment.organizer_id;

    insert into public.audit_log (actor_id, action, target_id, metadata, actor_email)
    values (
      v_actor,
      'organizer_subscription_payment',
      v_payment.organizer_id,
      jsonb_build_object(
        'amount', v_payment.amount,
        'currency', v_payment.currency,
        'payment_provider', v_payment.provider,
        'payment_reference', v_payment.provider_request_id
      ),
      v_org_email
    );
  end if;

  -- order_type = 'merch': merch_orders.status transitions are handled by
  -- the Django service; the payment row itself is the record of payment.

  return v_payment.id;
end;
$$;

revoke execute on function public.confirm_payment(text, text, text) from public;
revoke execute on function public.confirm_payment(text, text, text) from anon;
revoke execute on function public.confirm_payment(text, text, text) from authenticated;
grant execute on function public.confirm_payment(text, text, text) to service_role;

comment on function public.confirm_payment(text, text, text)
  is '059 webhook confirm; since 062 an already-paid registration keeps the second charge''s truth (completed) but audits payment_duplicate_detected instead of re-allocating a BIB';

-- 3. claim_payment_slot: serialized create-or-reuse of the pending
--    payments row (A-3). See the usage sequence in the header.
create or replace function public.claim_payment_slot(
  p_order_type text,
  p_registration_id uuid,
  p_merch_order_id uuid,
  p_organizer_id uuid,
  p_runner_id uuid,
  p_amount numeric,
  p_currency text default 'MYR'
) returns table(provider_request_id text, is_reservation boolean)
  language plpgsql
  security definer
  set search_path = ''
  as $$
declare
  v_existing public.payments;
  v_new      public.payments;
begin
  if p_order_type not in ('registration','merch','organizer_subscription') then
    raise exception 'Invalid order type: %', p_order_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid amount';
  end if;

  -- Serialize concurrent claims for the same logical order so the
  -- read-then-insert below can never interleave (A-3): two callers
  -- for one registration/order wait here; the second then sees the
  -- row the first inserted and reuses it.
  perform pg_advisory_xact_lock(
    hashtextextended(
      coalesce(
        concat_ws(':', p_order_type, p_registration_id::text, p_merch_order_id::text, p_organizer_id::text),
        'x'
      ),
      0
    )
  );

  select *
  into v_existing
  from public.payments
  where order_type = p_order_type
    and status = 'pending'
    and (
      (p_registration_id is not null and registration_id = p_registration_id)
      or (p_merch_order_id is not null and merch_order_id = p_merch_order_id)
      or (p_organizer_id is not null and organizer_id = p_organizer_id)
    )
  order by created_at
  limit 1;

  if found then
    -- Reuse: caller does NOT hit HitPay create; it GETs the existing
    -- PR by provider_request_id and reuses its checkout_url.
    return query select v_existing.provider_request_id, false;
  end if;

  -- Fresh claim: insert a pending row with a SYNTHETIC provider
  -- request id sentinel (real HitPay PR ids are assigned by the
  -- caller afterwards; the UNIQUE constraint keeps guarding them).
  v_new.provider_request_id := 'pending:' || gen_random_uuid()::text;

  insert into public.payments (
    order_type, registration_id, merch_order_id, organizer_id, runner_id,
    provider, provider_request_id, amount, currency, status
  ) values (
    p_order_type, p_registration_id, p_merch_order_id, p_organizer_id, p_runner_id,
    'hitpay', v_new.provider_request_id, p_amount, p_currency, 'pending'
  );

  return query select v_new.provider_request_id, true;
end;
$$;

revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from public;
revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from anon;
revoke execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) from authenticated;
grant execute on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text) to service_role;

comment on function public.claim_payment_slot(text, uuid, uuid, uuid, uuid, numeric, text)
  is 'serialized claim-or-reuse of the pending payments row (A-3, since 062). is_reservation=true ⇒ sentinel provider_request_id''pending:<uuid>''; caller links the real HitPay PR id on success and deletes the synthetic row on failure. service_role only';
