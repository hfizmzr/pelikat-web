-- ============================================================================
-- 054 — Merch Hub Manager (FR-37 … FR-41)
--
--  • Products: image, low-stock threshold, required event/organizer/price
--  • Variants: non-negative stock, one row per product/size/color
--  • Orders: event link, human order number, status flow
--      pending → confirmed → ready → collected   (+ cancelled)
--  • RLS for variants / order items (previously enabled with no policies)
--  • merch_update_order_status() — organizer status changes (single or bulk)
--  • merch_product_sales view — revenue and items sold per product
--  • merch-images storage bucket
-- ============================================================================

-- ── PRODUCTS ────────────────────────────────────────────────────────────────
alter table public.merch_products
  add column if not exists image_path text,
  add column if not exists low_stock_threshold int not null default 5,
  add column if not exists updated_at timestamptz not null default now();

update public.merch_products set price = 0 where price is null;

alter table public.merch_products
  alter column event_id set not null,
  alter column organizer_id set not null,
  alter column price set not null,
  add constraint merch_products_price_check check (price >= 0),
  add constraint merch_products_low_stock_threshold_check check (low_stock_threshold >= 0);

create index if not exists merch_products_event_id_idx on public.merch_products (event_id);
create index if not exists merch_products_organizer_id_idx on public.merch_products (organizer_id);

-- ── VARIANTS ────────────────────────────────────────────────────────────────
update public.merch_variants set stock = 0 where stock is null or stock < 0;

alter table public.merch_variants
  alter column product_id set not null,
  alter column stock set not null,
  add constraint merch_variants_stock_check check (stock >= 0);

-- size/color are optional (e.g. a tumbler is a single SKU), so compare them null-safe
create unique index if not exists merch_variants_product_size_color_key
  on public.merch_variants (product_id, coalesce(size, ''), coalesce(color, ''));

-- ── ORDERS ──────────────────────────────────────────────────────────────────
create sequence if not exists public.merch_order_number_seq;

alter table public.merch_orders
  add column if not exists event_id uuid references public.events(id),
  add column if not exists order_number text,
  add column if not exists ready_at timestamptz,
  add column if not exists collected_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.merch_orders
  alter column order_number set default
    'PM-' || lpad(nextval('public.merch_order_number_seq')::text, 6, '0');

update public.merch_orders
  set order_number = 'PM-' || lpad(nextval('public.merch_order_number_seq')::text, 6, '0')
  where order_number is null;

-- Backfill from the ordered products' event (no-op on an empty table)
update public.merch_orders o
  set event_id = p.event_id
  from public.merch_order_items oi
  join public.merch_variants v on v.id = oi.variant_id
  join public.merch_products p on p.id = v.product_id
  where oi.order_id = o.id and o.event_id is null;

alter table public.merch_orders
  alter column event_id set not null,
  alter column order_number set not null,
  add constraint merch_orders_order_number_key unique (order_number);

-- Map the old status set onto the new flow before swapping the constraint
alter table public.merch_orders drop constraint if exists merch_orders_status_check;

update public.merch_orders set status = 'confirmed' where status = 'paid';
update public.merch_orders set status = 'collected' where status = 'shipped';

alter table public.merch_orders
  alter column status set not null,
  add constraint merch_orders_status_check
    check (status in ('pending', 'confirmed', 'ready', 'collected', 'cancelled'));

create index if not exists merch_orders_event_status_idx on public.merch_orders (event_id, status);
create index if not exists merch_orders_organizer_id_idx on public.merch_orders (organizer_id);

-- ── ORDER ITEMS ─────────────────────────────────────────────────────────────
alter table public.merch_order_items
  alter column order_id set not null,
  alter column variant_id set not null,
  alter column unit_price set not null,
  add constraint merch_order_items_quantity_check check (quantity > 0),
  add constraint merch_order_items_unit_price_check check (unit_price >= 0);

create index if not exists merch_order_items_order_id_idx on public.merch_order_items (order_id);
create index if not exists merch_order_items_variant_id_idx on public.merch_order_items (variant_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Products: scope writes to the organizer AND to one of their own events
drop policy if exists "organizer manages own products" on public.merch_products;
create policy "organizer manages own products" on public.merch_products
  for all
  using (organizer_id = public.get_my_organizer_id())
  with check (
    organizer_id = public.get_my_organizer_id()
    and event_id in (
      select id from public.events where organizer_id = public.get_my_organizer_id()
    )
  );

-- Variants: readable wherever the parent product is readable (organizer or runner)
create policy "read variants of visible products" on public.merch_variants
  for select
  using (product_id in (select id from public.merch_products));

create policy "organizer manages own variants" on public.merch_variants
  for all
  using (
    product_id in (
      select id from public.merch_products where organizer_id = public.get_my_organizer_id()
    )
  )
  with check (
    product_id in (
      select id from public.merch_products where organizer_id = public.get_my_organizer_id()
    )
  );

-- Order items: readable wherever the parent order is readable (organizer or runner)
create policy "read items of visible orders" on public.merch_order_items
  for select
  using (order_id in (select id from public.merch_orders));

-- Order status changes go through merch_update_order_status(), so no UPDATE policy.

-- ── ORDER STATUS RPC ────────────────────────────────────────────────────────
-- Organizer-driven transitions (payment confirmation is the payment gateway's job):
--   confirmed → ready       mark fulfilled / ready for collection
--   ready     → collected   picked up at REPC
--   ready     → confirmed   undo "ready"
--   pending | confirmed | ready → cancelled   (confirmed/ready restock their variants)
-- Orders that are not in a valid source state are skipped. Returns the number updated.
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
    when 'ready'     then array['confirmed']
    when 'collected' then array['ready']
    when 'confirmed' then array['ready']
    when 'cancelled' then array['pending', 'confirmed', 'ready']
    else null
  end;

  if v_from is null then
    raise exception 'Unsupported status: %', p_status;
  end if;

  -- Lock the target orders so concurrent updates cannot double-restock
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(id) filter (where status in ('confirmed', 'ready')), '{}')
  into v_updated, v_restock
  from (
    select id, status
    from public.merch_orders
    where id = any(p_order_ids)
      and organizer_id = v_organizer_id
      and status = any(v_from)
    for update
  ) o;

  if cardinality(v_updated) = 0 then
    return 0;
  end if;

  update public.merch_orders
  set status       = p_status,
      ready_at     = case
                       when p_status = 'ready' then now()
                       when p_status = 'confirmed' then null
                       else ready_at
                     end,
      collected_at = case when p_status = 'collected' then now() else collected_at end,
      updated_at   = now()
  where id = any(v_updated);

  if p_status = 'cancelled' and cardinality(v_restock) > 0 then
    update public.merch_variants v
    set stock = v.stock + r.qty
    from (
      select variant_id, sum(quantity)::int as qty
      from public.merch_order_items
      where order_id = any(v_restock)
      group by variant_id
    ) r
    where v.id = r.variant_id;
  end if;

  insert into public.audit_log (actor_id, actor_email, action, metadata)
  select auth.uid(), u.email, 'merch.order_status',
         jsonb_build_object('status', p_status, 'order_ids', to_jsonb(v_updated))
  from (select 1) s
  left join auth.users u on u.id = auth.uid();

  return cardinality(v_updated);
end;
$$;

revoke all on function public.merch_update_order_status(uuid[], text) from public, anon;
grant execute on function public.merch_update_order_status(uuid[], text) to authenticated;

-- ── SALES SUMMARY VIEW ──────────────────────────────────────────────────────
-- security_invoker so the caller's RLS applies (organizers only see their own products)
create or replace view public.merch_product_sales
with (security_invoker = true) as
select
  p.id as product_id,
  p.event_id,
  p.organizer_id,
  p.name,
  coalesce(sum(oi.quantity) filter (
    where o.status in ('confirmed', 'ready', 'collected')
  ), 0)::int as items_sold,
  coalesce(sum(oi.quantity * oi.unit_price) filter (
    where o.status in ('confirmed', 'ready', 'collected')
  ), 0)::numeric(12, 2) as revenue
from public.merch_products p
left join public.merch_variants v on v.product_id = p.id
left join public.merch_order_items oi on oi.variant_id = v.id
left join public.merch_orders o on o.id = oi.order_id
group by p.id, p.event_id, p.organizer_id, p.name;

grant select on public.merch_product_sales to authenticated;

-- ── STORAGE: merch-images (public read, organizer writes own folder) ────────
-- Object path: {organizer_id}/{event_id}/{file}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merch-images', 'merch-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "organizer uploads merch images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'merch-images'
    and (storage.foldername(name))[1] = public.get_my_organizer_id()::text
  );

create policy "organizer updates merch images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'merch-images'
    and (storage.foldername(name))[1] = public.get_my_organizer_id()::text
  );

create policy "organizer deletes merch images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'merch-images'
    and (storage.foldername(name))[1] = public.get_my_organizer_id()::text
  );
