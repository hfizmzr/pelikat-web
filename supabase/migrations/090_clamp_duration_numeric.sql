-- ── ORGANIZER SUBSCRIPTION DURATION NUMERIC CLAMP (090) ─────
-- 089 parsed platform_settings ->>'duration_days' directly as int
-- BEFORE the 1..3650 clamp, so an absurd stored value (>2147483647)
-- raised `integer out of range` inside confirm_payment and rolled
-- back the whole paid-status update. From 090 the value is parsed
-- as numeric, the nullif/0-check and the least/greatest clamp apply
-- on the numeric, and only the clamped small value is cast to int
-- for the interval multiplication. Same clamp bounds and fallbacks
-- as 089: 0/null/missing -> 365; negative -> 1; >3650 -> 3650;
-- non-numeric remains a cast error (YAGNI-acceptable).
-- Everything else in the function body is byte-identical to 089.

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
  v_sub_days  numeric;
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

    -- Subscription length follows the pricing setting (073), in days.
    -- NOTE: the stored value IS the price object ({"amount": ..,
    -- "duration_days": 365}), matching the app reader src/lib/
    -- subscription.ts and the admin settings writer — not a nested
    -- 'organizer_subscription_price' object. 0/null/missing falls back
    -- to 365; sane range 1..3650. Extending from the later of (current
    -- expiry, now) so early renewals do not lose remaining days.
    -- Since 090 the value is parsed as numeric and clamped BEFORE the
    -- int cast, so absurd stored values no longer raise
    -- `integer out of range` inside this transaction.
    -- is_active=true reactivates an expired organizer who repays.
    select nullif((s.value->>'duration_days')::numeric, 0)
    into v_sub_days
    from public.platform_settings s
    where s.key = 'organizer_subscription_price';

    update public.organizers
    set sub_expires_at = greatest(coalesce(sub_expires_at, now()), now())
          + least(greatest(coalesce(v_sub_days, 365), 1), 3650)::int * interval '1 day',
        is_active = true
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
  is '059 webhook confirm; since 062 an already-paid registration keeps the second charge''s truth (completed) but audits payment_duplicate_detected; since 089 the organizer_subscription branch extends by platform_settings duration_days (clamped 1..3650, fallback 365); since 090 duration_days is parsed as numeric and the 1..3650 clamp applies before the int cast, so absurd stored values no longer raise integer out of range';
