-- ============================================================================
-- Merch Store demo products (run AFTER migration 056, in the Supabase SQL editor)
--
-- Adds 3 products with variants — no orders — to an upcoming event so runners
-- can test the store end to end. Defaults to "kl run" (Org A, 2027-06-15),
-- whose two runners have paid registrations. Change v_event_id to target
-- another event. Re-running is a no-op if the event already has products.
--
-- Stock is chosen to show every state: Tee M is low, Tee XL sold out,
-- Tumbler low (threshold 10).
--
-- To remove the demo data again, see the cleanup block at the bottom.
-- ============================================================================

do $$
declare
  v_event_id uuid := '29eab7c4-ee02-4ae2-97f1-445bbc4e3979'; -- "kl run"
  v_organizer_id uuid;
  v_tee uuid;
  v_cap uuid;
  v_tumbler uuid;
begin
  select organizer_id into v_organizer_id from public.events where id = v_event_id;
  if v_organizer_id is null then
    raise exception 'Event % not found', v_event_id;
  end if;

  if exists (select 1 from public.merch_products where event_id = v_event_id) then
    raise notice 'Event already has merch products, skipping seed';
    return;
  end if;

  insert into public.merch_products (event_id, organizer_id, name, description, price, low_stock_threshold)
  values (v_event_id, v_organizer_id, 'Finisher Tee', 'Dri-fit finisher t-shirt with event print.', 45.00, 5)
  returning id into v_tee;

  insert into public.merch_products (event_id, organizer_id, name, description, price, low_stock_threshold)
  values (v_event_id, v_organizer_id, 'Running Cap', 'Lightweight cap with reflective logo.', 30.00, 5)
  returning id into v_cap;

  insert into public.merch_products (event_id, organizer_id, name, description, price, low_stock_threshold)
  values (v_event_id, v_organizer_id, 'Steel Tumbler', '500ml insulated tumbler.', 39.90, 10)
  returning id into v_tumbler;

  insert into public.merch_variants (product_id, size, stock) values
    (v_tee, 'S', 20),
    (v_tee, 'M', 3),   -- low stock
    (v_tee, 'L', 18),
    (v_tee, 'XL', 0),  -- sold out
    (v_cap, null, 40),
    (v_tumbler, null, 6); -- low (threshold 10)

  raise notice 'Seeded merch store demo products for event %', v_event_id;
end $$;

-- ── CLEANUP (uncomment to remove demo data for the event) ───────────────────
-- Orders reference variants, so delete orders first.
-- delete from public.merch_order_items where order_id in (
--   select id from public.merch_orders where event_id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979'
-- );
-- delete from public.merch_orders where event_id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979';
-- delete from public.merch_variants where product_id in (
--   select id from public.merch_products where event_id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979'
-- );
-- delete from public.merch_products where event_id = '29eab7c4-ee02-4ae2-97f1-445bbc4e3979';
