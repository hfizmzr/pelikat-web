-- ── HITPAY PAYMENTS + WEBHOOK EVENTS ─────────────────────────
-- Task 1 of the HitPay gateway plan.
--
-- payments: one row per payment intent created by the Django
--   payment service (service-role writes only; Postgres-side RLS is
--   read-mostly). provider_request_id is the idempotency anchor the
--   Django side sends to HitPay; provider_payment_id is what HitPay
--   returns/echoes in webhooks.
--
-- webhook_events: raw HitPay webhook log. payload_hash (sha256 hex of
--   the raw body) is the dedupe anchor — the webhook handler inserts
--   first and lets the unique constraint reject replays.
--
-- confirm_payment: the single service-role entry point that flips a
--   pending payment to completed and applies its side effects
--   (BIB allocation for registrations, subscription extension for
--   organizers). Body adapted from 056/057 confirm_dummy_payment.

create table payments (
  id                   uuid primary key default gen_random_uuid(),
  order_type           text not null
    check (order_type in ('registration','merch','organizer_subscription')),
  registration_id      uuid references registrations(id) on delete set null,
  merch_order_id       uuid references merch_orders(id) on delete set null,
  organizer_id         uuid references organizers(id),
  runner_id            uuid references runner_profiles(id),
  provider             text not null default 'hitpay',
  provider_request_id  text not null unique,
  provider_payment_id  text,
  amount               numeric(10,2) not null,
  currency             text not null default 'MYR',
  status               text not null default 'pending'
    check (status in ('pending','completed','failed','expired','canceled','refunded','partially_refunded')),
  payment_rail         text,
  refund_blocked_reason text,
  qr_code_data         jsonb,
  last_webhook_payload jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  event_type    text not null,
  object_id     text,
  payload       jsonb,
  payload_hash  text not null unique,
  received_at   timestamptz not null default now()
);

create index payments_registration_id_idx on payments (registration_id);
create index payments_pending_status_idx on payments (status) where status = 'pending';
create index webhook_events_received_at_idx on webhook_events (received_at);

-- ── CONFIRM PAYMENT RPC ──────────────────────────────────────
-- Called by the Django payment service with the service_role key
-- after HitPay confirms a charge. Idempotent: a payment that is not
-- found returns null; one already processed returns its id unchanged.

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

    -- Skip if the registration was already confirmed by another path
    -- (e.g. the dummy-payment flow) — do not re-allocate a BIB.
    if v_reg.payment_status <> 'paid' then
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

-- ── RLS ──────────────────────────────────────────────────────
-- Writes come from the Django service role only (bypasses RLS).
-- No INSERT/UPDATE/DELETE policies are created for anon/authenticated.

alter table payments enable row level security;
alter table payments force row level security;
alter table webhook_events enable row level security;
alter table webhook_events force row level security;

create policy "runner reads own payments" on payments
  for select using (runner_id = my_runner_id());

create policy "organizer reads own payments" on payments
  for select using (organizer_id = get_my_organizer_id());

create policy "organizer updates own payments" on payments
  for update
  using (organizer_id = get_my_organizer_id())
  with check (organizer_id = get_my_organizer_id());

create policy "admin manages payments" on payments
  for all using (is_admin());

create policy "admin manages webhook_events" on webhook_events
  for all using (is_admin());
