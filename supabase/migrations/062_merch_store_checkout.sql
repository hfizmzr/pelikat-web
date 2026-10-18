-- ============================================================================
-- 062 — Runner Merch Store (FR-69 … FR-73) + REPC merch hand-over
--
--  Renumbered from 056 when merging main (main has its own 056; 059–061 are
--  taken by the HitPay migrations). Already applied to Supabase as
--  056_merch_store_checkout (version 20261012162734); the file name changed,
--  not the contents. Review fixes go in 063, not here.
--
--  • Orders: payment + stock-reservation columns
--  • Order items: product name / variant label snapshot, so order history
--    still reads correctly after a product is renamed, hidden or edited
--  • Runners no longer insert orders directly — checkout goes through
--    merch_checkout(), which prices items server-side and reserves stock
--  • Stock is reserved for 15 minutes while an order is `pending`; unpaid
--    reservations are released by merch_release_expired_orders() (pg_cron)
--  • merch_confirm_payment() — pending → confirmed, service role only
--    (called by the payment gateway callback, never by the browser)
--  • merch_cancel_checkout() — runner abandons their unpaid order
--  • merch_update_order_status() — cancelling a pending order now also
--    returns its reserved stock
--  • merch_collect_for_runner() — REPC scan marks the runner's `ready`
--    orders `collected`
--
-- Reserved vs. not reserved: a `pending` order holds stock only when
-- `expires_at` is set. Orders created before this migration (e.g. the demo
-- seed) have no `expires_at` and never decremented stock, so they are not
-- restocked when cancelled.
-- ============================================================================

-- ── ORDERS ──────────────────────────────────────────────────────────────────
alter table public.merch_orders
  add column if not exists expires_at timestamptz,
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

alter table public.merch_orders
  add constraint merch_orders_payment_method_check
    check (payment_method is null or payment_method in ('fpx', 'card'));

create unique index if not exists merch_orders_payment_ref_key
  on public.merch_orders (payment_ref) where payment_ref is not null;

create index if not exists merch_orders_runner_id_idx on public.merch_orders (runner_id);
create index if not exists merch_orders_pending_expiry_idx
  on public.merch_orders (expires_at) where status = 'pending';

-- ── ORDER ITEMS: snapshot ───────────────────────────────────────────────────
alter table public.merch_order_items
  add column if not exists product_name text,
  add column if not exists variant_label text;

update public.merch_order_items oi
  set product_name  = p.name,
      variant_label = coalesce(nullif(concat_ws(' / ', v.size, v.color), ''), 'One size')
  from public.merch_variants v
  join public.merch_products p on p.id = v.product_id
  where v.id = oi.variant_id and oi.product_name is null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Orders are created by merch_checkout() only; a direct insert could set any
-- status or price.
drop policy if exists "runner inserts own order" on public.merch_orders;

-- ── HELPERS (internal) ──────────────────────────────────────────────────────
-- Put the items of the given orders back into stock.
create or replace function public.merch_restock_orders(p_order_ids uuid[])
returns void
language sql
security definer
set search_path to ''
as $$
  update public.merch_variants v
  set stock = v.stock + r.qty
  from (
    select variant_id, sum(quantity)::int as qty
    from public.merch_order_items
    where order_id = any(p_order_ids)
    group by variant_id
  ) r
  where v.id = r.variant_id;
$$;

revoke all on function public.merch_restock_orders(uuid[]) from public, anon, authenticated;

-- Cancel unpaid orders whose reservation has run out and return their stock.
-- Run every minute by pg_cron, and at the start of every checkout.
create or replace function public.merch_release_expired_orders()
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from (
    select id
    from public.merch_orders
    where status = 'pending'
      and expires_at is not null
      and expires_at < now()
    for update skip locked
  ) o;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  update public.merch_orders
  set status        = 'cancelled',
      cancelled_at  = now(),
      cancel_reason = 'expired',
      expires_at    = null,
      updated_at    = now()
  where id = any(v_ids);

  perform public.merch_restock_orders(v_ids);

  return cardinality(v_ids);
end;
$$;

revoke all on function public.merch_release_expired_orders() from public, anon, authenticated;

-- ── CHECKOUT (runner) ───────────────────────────────────────────────────────
-- p_items: [{ "variant_id": uuid, "quantity": int }, ...]
-- Creates a `pending` order, prices it from the database, and reserves the
-- stock for 15 minutes. Any earlier unpaid order the runner has for the same
-- event is cancelled first, so a runner holds at most one reservation per event.
create or replace function public.merch_checkout(
  p_event_id uuid,
  p_items jsonb,
  p_payment_method text
)
returns table (order_id uuid, order_number text, total_amount numeric, expires_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_runner_id uuid := public.my_runner_id();
  v_event record;
  v_variant_ids uuid[];
  v_quantities int[];
  v_previous uuid[];
  v_previous_reserved uuid[];
  v_found int;
  v_short record;
  v_total numeric(12, 2);
  v_order_id uuid;
  v_order_number text;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if v_runner_id is null then
    raise exception 'Only runners can buy merch';
  end if;

  if p_payment_method is null or p_payment_method not in ('fpx', 'card') then
    raise exception 'Choose FPX or card as the payment method';
  end if;

  select e.id, e.organizer_id, e.event_date, e.status
  into v_event
  from public.events e
  where e.id = p_event_id;

  if not found or v_event.status <> 'published' then
    raise exception 'Event not found';
  end if;

  if v_event.event_date < (now() at time zone 'Asia/Kuala_Lumpur')::date then
    raise exception 'Merch sales for this event have closed';
  end if;

  if not exists (
    select 1 from public.registrations r
    where r.event_id = p_event_id
      and r.runner_id = v_runner_id
      and r.payment_status = 'paid'
  ) then
    raise exception 'Complete your race registration payment before buying merch';
  end if;

  -- Cart lines, merged per variant
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Your cart is empty';
  end if;

  begin
    select array_agg(c.variant_id order by c.variant_id),
           array_agg(c.quantity order by c.variant_id)
    into v_variant_ids, v_quantities
    from (
      select (item ->> 'variant_id')::uuid as variant_id,
             sum((item ->> 'quantity')::int)::int as quantity
      from jsonb_array_elements(p_items) item
      group by 1
    ) c;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Your cart has an invalid item';
  end;

  if coalesce(cardinality(v_variant_ids), 0) = 0 then
    raise exception 'Your cart is empty';
  end if;

  if array_position(v_variant_ids, null) is not null then
    raise exception 'Your cart has an invalid item';
  end if;

  if cardinality(v_variant_ids) > 20 then
    raise exception 'Too many different items in one order (max 20)';
  end if;

  if exists (
    select 1 from unnest(v_quantities) q
    where q is null or q < 1 or q > 10
  ) then
    raise exception 'Quantity per item must be between 1 and 10';
  end if;

  perform public.merch_release_expired_orders();

  -- Drop the runner's earlier unpaid order for this event and return its stock
  select coalesce(array_agg(o.id), '{}'),
         coalesce(array_agg(o.id) filter (where o.reserved), '{}')
  into v_previous, v_previous_reserved
  from (
    select mo.id, mo.expires_at is not null as reserved
    from public.merch_orders mo
    where mo.runner_id = v_runner_id
      and mo.event_id = p_event_id
      and mo.status = 'pending'
    for update
  ) o;

  if cardinality(v_previous) > 0 then
    update public.merch_orders mo
    set status        = 'cancelled',
        cancelled_at  = now(),
        cancel_reason = 'replaced',
        expires_at    = null,
        updated_at    = now()
    where mo.id = any(v_previous);

    if cardinality(v_previous_reserved) > 0 then
      perform public.merch_restock_orders(v_previous_reserved);
    end if;
  end if;

  -- Lock the variants in a fixed order so concurrent checkouts can't deadlock
  perform 1
  from public.merch_variants v
  where v.id = any(v_variant_ids)
  order by v.id
  for update;

  select count(*) into v_found
  from public.merch_variants v
  join public.merch_products p on p.id = v.product_id
  where v.id = any(v_variant_ids)
    and p.event_id = p_event_id
    and p.is_active;

  if v_found <> cardinality(v_variant_ids) then
    raise exception 'Some items in your cart are no longer available';
  end if;

  select p.name,
         coalesce(nullif(concat_ws(' / ', v.size, v.color), ''), 'One size') as label,
         v.stock
  into v_short
  from unnest(v_variant_ids, v_quantities) as c(variant_id, quantity)
  join public.merch_variants v on v.id = c.variant_id
  join public.merch_products p on p.id = v.product_id
  where v.stock < c.quantity
  limit 1;

  if found then
    if v_short.stock = 0 then
      raise exception '% (%) is sold out', v_short.name, v_short.label;
    end if;
    raise exception 'Only % left of % (%)', v_short.stock, v_short.name, v_short.label;
  end if;

  select sum(c.quantity * p.price)::numeric(12, 2) into v_total
  from unnest(v_variant_ids, v_quantities) as c(variant_id, quantity)
  join public.merch_variants v on v.id = c.variant_id
  join public.merch_products p on p.id = v.product_id;

  update public.merch_variants v
  set stock = v.stock - c.quantity
  from unnest(v_variant_ids, v_quantities) as c(variant_id, quantity)
  where v.id = c.variant_id;

  insert into public.merch_orders as mo (
    runner_id, organizer_id, event_id, total_amount, status, expires_at, payment_method
  )
  values (
    v_runner_id, v_event.organizer_id, p_event_id, v_total, 'pending', v_expires_at, p_payment_method
  )
  returning mo.id, mo.order_number into v_order_id, v_order_number;

  insert into public.merch_order_items (
    order_id, variant_id, quantity, unit_price, product_name, variant_label
  )
  select v_order_id, v.id, c.quantity, p.price, p.name,
         coalesce(nullif(concat_ws(' / ', v.size, v.color), ''), 'One size')
  from unnest(v_variant_ids, v_quantities) as c(variant_id, quantity)
  join public.merch_variants v on v.id = c.variant_id
  join public.merch_products p on p.id = v.product_id;

  insert into public.audit_log (actor_id, actor_email, action, target_id, metadata)
  select auth.uid(), u.email, 'merch.checkout', v_order_id,
         jsonb_build_object('order_number', v_order_number, 'event_id', p_event_id,
                            'total', v_total, 'payment_method', p_payment_method)
  from (select 1) s
  left join auth.users u on u.id = auth.uid();

  return query select v_order_id, v_order_number, v_total, v_expires_at;
end;
$$;

revoke all on function public.merch_checkout(uuid, jsonb, text) from public, anon;
grant execute on function public.merch_checkout(uuid, jsonb, text) to authenticated;

-- ── CANCEL CHECKOUT (runner) ────────────────────────────────────────────────
create or replace function public.merch_cancel_checkout(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_runner_id uuid := public.my_runner_id();
  v_reserved boolean;
begin
  select expires_at is not null into v_reserved
  from public.merch_orders
  where id = p_order_id
    and runner_id = v_runner_id
    and status = 'pending'
  for update;

  if not found then
    return false;
  end if;

  update public.merch_orders
  set status        = 'cancelled',
      cancelled_at  = now(),
      cancel_reason = 'cancelled_by_runner',
      expires_at    = null,
      updated_at    = now()
  where id = p_order_id;

  if v_reserved then
    perform public.merch_restock_orders(array[p_order_id]);
  end if;

  return true;
end;
$$;

revoke all on function public.merch_cancel_checkout(uuid) from public, anon;
grant execute on function public.merch_cancel_checkout(uuid) to authenticated;

-- ── CONFIRM PAYMENT (payment gateway callback, service role only) ───────────
-- pending → confirmed. Accepted even after expires_at as long as the order is
-- still pending (its stock is still held). A cancelled/expired order is
-- rejected — the gateway side must refund that payment.
-- Calling it again with the same reference is a no-op.
create or replace function public.merch_confirm_payment(
  p_order_id uuid,
  p_payment_ref text,
  p_payment_method text
)
returns table (order_number text, status text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order record;
begin
  if p_payment_ref is null or trim(p_payment_ref) = '' then
    raise exception 'Payment reference is required';
  end if;

  select mo.id, mo.order_number, mo.status, mo.payment_ref
  into v_order
  from public.merch_orders mo
  where mo.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.status <> 'pending' then
    if v_order.payment_ref = p_payment_ref then
      return query select v_order.order_number, v_order.status;
      return;
    end if;
    raise exception 'Order % is %, payment not applied', v_order.order_number, v_order.status;
  end if;

  update public.merch_orders mo
  set status         = 'confirmed',
      payment_ref    = p_payment_ref,
      payment_method = coalesce(p_payment_method, mo.payment_method),
      paid_at        = now(),
      expires_at     = null,
      updated_at     = now()
  where mo.id = p_order_id;

  insert into public.audit_log (action, target_id, metadata)
  values ('merch.payment_confirmed', p_order_id,
          jsonb_build_object('order_number', v_order.order_number,
                             'payment_ref', p_payment_ref,
                             'payment_method', p_payment_method));

  return query select v_order.order_number, 'confirmed'::text;
end;
$$;

revoke all on function public.merch_confirm_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.merch_confirm_payment(uuid, text, text) to service_role;

-- ── ORGANIZER STATUS RPC: restock reserved pending orders on cancel ─────────
-- Same as 055, except a cancelled `pending` order with a reservation
-- (expires_at set) now also returns its stock, and cancelled_at is recorded.
create or replace function public.merch_update_order_status(
  p_order_ids uuid[],
  p_status text
)
returns int
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_organizer_id uuid := public.get_my_organizer_id();
  v_from text[];
  v_updated uuid[];
  v_restock uuid[];
begin
  if v_organizer_id is null then
    raise exception 'Only organizers can update merch orders';
  end if;

  v_from := case p_status
    when 'ready'     then array['confirmed', 'collected']
    when 'collected' then array['ready']
    when 'confirmed' then array['ready']
    when 'cancelled' then array['pending', 'confirmed', 'ready']
    else null
  end;

  if v_from is null then
    raise exception 'Unsupported status: %', p_status;
  end if;

  -- Lock the target orders so concurrent updates cannot double-restock
  select coalesce(array_agg(id), '{}'),
         coalesce(array_agg(id) filter (
           where status in ('confirmed', 'ready')
              or (status = 'pending' and expires_at is not null)
         ), '{}')
  into v_updated, v_restock
  from (
    select id, status, expires_at
    from public.merch_orders
    where id = any(p_order_ids)
      and organizer_id = v_organizer_id
      and status = any(v_from)
    for update
  ) o;

  if cardinality(v_updated) = 0 then
    return 0;
  end if;

  -- In SET expressions "status" is the row's previous status
  update public.merch_orders
  set status        = p_status,
      ready_at      = case
                        when p_status = 'ready' and status = 'confirmed' then now()
                        when p_status = 'confirmed' then null
                        else ready_at
                      end,
      collected_at  = case
                        when p_status = 'collected' then now()
                        when p_status = 'ready' then null
                        else collected_at
                      end,
      cancelled_at  = case when p_status = 'cancelled' then now() else cancelled_at end,
      cancel_reason = case when p_status = 'cancelled' then 'cancelled_by_organizer' else cancel_reason end,
      expires_at    = case when p_status = 'cancelled' then null else expires_at end,
      updated_at    = now()
  where id = any(v_updated);

  if p_status = 'cancelled' and cardinality(v_restock) > 0 then
    perform public.merch_restock_orders(v_restock);
  end if;

  insert into public.audit_log (actor_id, actor_email, action, metadata)
  select auth.uid(), u.email, 'merch.order_status',
         jsonb_build_object('status', p_status, 'order_ids', to_jsonb(v_updated))
  from (select 1) s
  left join auth.users u on u.id = auth.uid();

  return cardinality(v_updated);
end;
$$;

-- ── REPC HAND-OVER ──────────────────────────────────────────────────────────
-- Called after a successful REPC scan (self or proxy, including re-scans of an
-- already checked-in runner). Marks the runner's `ready` orders `collected`
-- and also returns their paid-but-not-packed (`confirmed`) orders so staff
-- can see what's still outstanding.
create or replace function public.merch_collect_for_runner(
  p_event_id uuid,
  p_runner_id uuid
)
returns table (order_id uuid, order_number text, item_count int, collected boolean)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_organizer_id uuid := public.get_my_organizer_id();
  v_is_admin boolean := coalesce(public.is_admin(), false);
  v_event_organizer uuid;
  v_collected uuid[];
begin
  select e.organizer_id into v_event_organizer
  from public.events e
  where e.id = p_event_id;

  if v_event_organizer is null
     or (not v_is_admin and (v_organizer_id is null or v_event_organizer <> v_organizer_id)) then
    raise exception 'Not allowed to hand over merch for this event';
  end if;

  with done as (
    update public.merch_orders mo
    set status       = 'collected',
        collected_at = now(),
        updated_at   = now()
    where mo.event_id = p_event_id
      and mo.runner_id = p_runner_id
      and mo.status = 'ready'
    returning mo.id
  )
  select coalesce(array_agg(done.id), '{}') into v_collected from done;

  if cardinality(v_collected) > 0 then
    insert into public.audit_log (actor_id, actor_email, action, target_id, metadata)
    select auth.uid(), u.email, 'merch.collected_at_repc', p_runner_id,
           jsonb_build_object('event_id', p_event_id, 'order_ids', to_jsonb(v_collected))
    from (select 1) s
    left join auth.users u on u.id = auth.uid();
  end if;

  return query
  select mo.id, mo.order_number,
         coalesce((select sum(oi.quantity)::int from public.merch_order_items oi
                   where oi.order_id = mo.id), 0),
         mo.id = any(v_collected)
  from public.merch_orders mo
  where mo.event_id = p_event_id
    and mo.runner_id = p_runner_id
    and (mo.id = any(v_collected) or mo.status = 'confirmed')
  order by mo.created_at;
end;
$$;

revoke all on function public.merch_collect_for_runner(uuid, uuid) from public, anon;
grant execute on function public.merch_collect_for_runner(uuid, uuid) to authenticated;

-- ── SCHEDULE: release expired reservations every minute ─────────────────────
select cron.schedule(
  'merch-release-expired-orders',
  '* * * * *',
  'select public.merch_release_expired_orders()'
);
