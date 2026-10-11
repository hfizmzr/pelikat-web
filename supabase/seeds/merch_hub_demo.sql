-- ============================================================================
-- Merch Hub demo data (run AFTER migration 054, in the Supabase SQL editor)
--
-- Creates 3 products with variants and ~10 runner orders across every status
-- for one event, using runners already registered for that event.
-- Change v_event_id below to target a different event.
-- Re-running is a no-op if the event already has merch products.
--
-- To remove the demo data again, see the cleanup block at the bottom.
-- ============================================================================

do $$
declare
  v_event_id uuid := '4d11bc81-615b-4125-9501-4b9a7375728f'; -- "abdul run"
  v_organizer_id uuid;
  v_runner_ids uuid[];
  v_tee uuid;
  v_cap uuid;
  v_tumbler uuid;
  v_tee_m uuid;
  v_tee_l uuid;
  v_tee_xl uuid;
  v_cap_one uuid;
  v_tumbler_one uuid;
  v_order uuid;
  v_statuses text[] := array[
    'pending', 'confirmed', 'confirmed', 'confirmed', 'ready',
    'ready', 'collected', 'collected', 'collected', 'cancelled'
  ];
  i int;
begin
  select organizer_id into v_organizer_id from public.events where id = v_event_id;
  if v_organizer_id is null then
    raise exception 'Event % not found', v_event_id;
  end if;

  if exists (select 1 from public.merch_products where event_id = v_event_id) then
    raise notice 'Event already has merch products, skipping seed';
    return;
  end if;

  select array_agg(distinct runner_id) into v_runner_ids
  from public.registrations
  where event_id = v_event_id and runner_id is not null;

  if v_runner_ids is null then
    raise exception 'Event % has no registered runners to place orders', v_event_id;
  end if;

  -- Products ----------------------------------------------------------------
  insert into public.merch_products (event_id, organizer_id, name, description, price, low_stock_threshold)
  values (v_event_id, v_organizer_id, 'Finisher Tee', 'Dri-fit finisher t-shirt with event print.', 45.00, 5)
  returning id into v_tee;

  insert into public.merch_products (event_id, organizer_id, name, description, price, low_stock_threshold)
  values (v_event_id, v_organizer_id, 'Running Cap', 'Lightweight cap with reflective logo.', 30.00, 5)
  returning id into v_cap;

  insert into public.merch_products (event_id, organizer_id, name, description, price, low_stock_threshold, is_active)
  values (v_event_id, v_organizer_id, 'Steel Tumbler', '500ml insulated tumbler.', 39.90, 10, true)
  returning id into v_tumbler;

  insert into public.merch_variants (product_id, size, stock) values (v_tee, 'S', 20);
  insert into public.merch_variants (product_id, size, stock) values (v_tee, 'M', 3) returning id into v_tee_m;   -- low stock
  insert into public.merch_variants (product_id, size, stock) values (v_tee, 'L', 18) returning id into v_tee_l;
  insert into public.merch_variants (product_id, size, stock) values (v_tee, 'XL', 0) returning id into v_tee_xl; -- sold out
  insert into public.merch_variants (product_id, size, stock) values (v_cap, null, 40) returning id into v_cap_one;
  insert into public.merch_variants (product_id, size, stock) values (v_tumbler, null, 6) returning id into v_tumbler_one; -- low (threshold 10)

  -- Orders ------------------------------------------------------------------
  for i in 1..array_length(v_statuses, 1) loop
    insert into public.merch_orders (runner_id, organizer_id, event_id, total_amount, payment_ref, status, created_at, ready_at, collected_at)
    values (
      v_runner_ids[1 + (i - 1) % array_length(v_runner_ids, 1)],
      v_organizer_id,
      v_event_id,
      0,
      case when v_statuses[i] = 'pending' then null else 'DEMO-' || lpad(i::text, 4, '0') end,
      v_statuses[i],
      now() - make_interval(hours => (array_length(v_statuses, 1) - i) * 7),
      case when v_statuses[i] in ('ready', 'collected') then now() - interval '2 hours' end,
      case when v_statuses[i] = 'collected' then now() - interval '1 hour' end
    )
    returning id into v_order;

    insert into public.merch_order_items (order_id, variant_id, quantity, unit_price)
    values (v_order, (array[v_tee_m, v_tee_l, v_tee_xl])[1 + i % 3], 1 + i % 2, 45.00);

    if i % 2 = 0 then
      insert into public.merch_order_items (order_id, variant_id, quantity, unit_price)
      values (v_order, v_cap_one, 1, 30.00);
    end if;

    if i % 3 = 0 then
      insert into public.merch_order_items (order_id, variant_id, quantity, unit_price)
      values (v_order, v_tumbler_one, 1, 39.90);
    end if;

    update public.merch_orders
    set total_amount = (
      select sum(quantity * unit_price) from public.merch_order_items where order_id = v_order
    )
    where id = v_order;
  end loop;

  raise notice 'Seeded merch demo data for event %', v_event_id;
end $$;

-- ── CLEANUP (uncomment to remove demo data for the event) ───────────────────
-- delete from public.merch_order_items where order_id in (
--   select id from public.merch_orders where event_id = '4d11bc81-615b-4125-9501-4b9a7375728f'
-- );
-- delete from public.merch_orders where event_id = '4d11bc81-615b-4125-9501-4b9a7375728f';
-- delete from public.merch_products where event_id = '4d11bc81-615b-4125-9501-4b9a7375728f';
