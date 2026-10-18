-- ============================================================================
-- Migration 062 + 063 flow test: runner checkout → payment → ready → REPC collected,
-- plus expiry, cancel and rejection cases.
--
-- Run in the Supabase SQL editor (or execute_sql with write access).
-- Leaves NO data behind: everything happens in one DO block that ends with
-- RAISE EXCEPTION, so the whole transaction is rolled back. The exception
-- message is the test report. Every line should read as expected; any line
-- containing "FAIL" is a bug.
--
-- Uses event "kl run" (29eab7c4-…), whichever organizer currently owns it, and its two paid runners
-- (hafiz amzar, Abu bin Runner). Creates temporary TEST products.
-- Callers are impersonated by setting request.jwt.claims + SET LOCAL ROLE.
-- ============================================================================

do $test$
declare
  v_event uuid := '29eab7c4-ee02-4ae2-97f1-445bbc4e3979';
  v_org uuid;
  v_org_user uuid;
  v_hafiz_user uuid := '0b660aee-821f-4271-91ca-bf6e35761d84';
  v_hafiz uuid := '0e3a33a1-2da0-408e-93cc-af02e830533c';
  v_abu_user uuid := '3b97043b-76cc-488b-8d60-3f9e940ebdd1';
  v_abu uuid := 'f9f83b43-d731-4da5-9d44-62f43318be70';
  v_tee uuid; v_cap uuid; v_tee_m uuid; v_tee_l uuid; v_cap_one uuid;
  v_log text := '';
  r record; v_a1 uuid; v_a2 uuid; v_b1 uuid; v_n int; v_s text; v_ok boolean;
begin
  -- ── setup (as postgres) ──
  -- Look the organizer up: the event has been transferred between organizers before
  select organizer_id into v_org from public.events where id = v_event;
  -- A real user of that organizer: REPC check-in records the staff user id (FK to auth.users)
  select u.id into v_org_user from auth.users u where u.raw_app_meta_data ->> 'organizer_id' = v_org::text limit 1;
  insert into public.merch_products (event_id, organizer_id, name, price, low_stock_threshold)
    values (v_event, v_org, 'TEST Tee', 45, 1) returning id into v_tee;
  insert into public.merch_products (event_id, organizer_id, name, price)
    values (v_event, v_org, 'TEST Cap', 30) returning id into v_cap;
  insert into public.merch_variants (product_id, size, stock) values (v_tee, 'M', 3) returning id into v_tee_m;
  insert into public.merch_variants (product_id, size, stock) values (v_tee, 'L', 0) returning id into v_tee_l;
  insert into public.merch_variants (product_id, stock) values (v_cap, 5) returning id into v_cap_one;

  -- ── runner: hafiz ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_hafiz_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- expect: total 120.00 (2×45 + 30), expires in 15 min; duplicate lines merged
  select * into r from public.merch_checkout(v_event, jsonb_build_array(
    jsonb_build_object('variant_id', v_tee_m, 'quantity', 1),
    jsonb_build_object('variant_id', v_tee_m, 'quantity', 1),
    jsonb_build_object('variant_id', v_cap_one, 'quantity', 1)), 'fpx');
  v_a1 := r.order_id;
  v_log := v_log || format(E'\n01 checkout: %s total=%s expires_in_min=%s  [expect total=120.00, 15]',
    r.order_number, r.total_amount, round(extract(epoch from r.expires_at - now()) / 60));

  begin perform public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_cap_one, 'quantity', 11)), 'fpx');
    v_log := v_log || E'\n02 qty 11: FAIL accepted';
  exception when others then v_log := v_log || E'\n02 qty 11 rejected: ' || sqlerrm; end;

  begin perform public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_tee_l, 'quantity', 1)), 'fpx');
    v_log := v_log || E'\n03 sold out: FAIL accepted';
  exception when others then v_log := v_log || E'\n03 sold out rejected: ' || sqlerrm; end;

  begin perform public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_tee_m, 'quantity', 5)), 'fpx');
    v_log := v_log || E'\n04 over stock: FAIL accepted';
  exception when others then v_log := v_log || E'\n04 over stock rejected: ' || sqlerrm; end;

  begin perform public.merch_checkout(v_event, '[{"variant_id":"not-a-uuid","quantity":1}]', 'fpx');
    v_log := v_log || E'\n05 bad uuid: FAIL accepted';
  exception when others then v_log := v_log || E'\n05 bad uuid rejected: ' || sqlerrm; end;

  begin perform public.merch_checkout(v_event, '[]', 'paypal');
    v_log := v_log || E'\n06 bad method: FAIL accepted';
  exception when others then v_log := v_log || E'\n06 bad method rejected: ' || sqlerrm; end;

  begin
    insert into public.merch_orders (runner_id, organizer_id, event_id, total_amount, status)
      values (v_hafiz, v_org, v_event, 0, 'confirmed');
    v_log := v_log || E'\n07 direct insert: FAIL accepted';
  exception when others then v_log := v_log || E'\n07 direct insert rejected: ' || sqlerrm; end;

  begin perform public.merch_confirm_payment(v_a1, 'HACK', 'fpx');
    v_log := v_log || E'\n08 runner confirms own payment: FAIL accepted';
  exception when others then v_log := v_log || E'\n08 runner confirm rejected: ' || sqlerrm; end;

  begin perform public.merch_release_expired_orders();
    v_log := v_log || E'\n09 runner calls release: FAIL accepted';
  exception when others then v_log := v_log || E'\n09 runner release rejected: ' || sqlerrm; end;

  -- Tee M has 1 left, but the first order holds 2 → replacing it frees them, so 3 fit
  select * into r from public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_tee_m, 'quantity', 3)), 'card');
  v_a2 := r.order_id;
  select count(*) into v_n from public.merch_orders where runner_id = v_hafiz and event_id = v_event;
  v_log := v_log || format(E'\n10 replace checkout: %s total=%s, runner sees %s order(s) via RLS  [expect 135.00]',
    r.order_number, r.total_amount, v_n);
  reset role;

  select string_agg(format('%s %s=%s', p.name, coalesce(v.size, '-'), v.stock), ', ' order by p.name, v.size) into v_s
    from public.merch_variants v join public.merch_products p on p.id = v.product_id where p.event_id = v_event and p.name like 'TEST %';
  v_log := v_log || format(E'\n   stock: %s | first order: %s  [expect Cap=5, Tee L=0, Tee M=0 | cancelled/replaced]',
    v_s, (select status || '/' || cancel_reason from public.merch_orders where id = v_a1));

  -- ── payment gateway (service role) ──
  set local role service_role;
  select * into r from public.merch_confirm_payment(v_a2, 'TEST-REF-1', 'card');
  v_log := v_log || format(E'\n11 confirm: %s %s', r.order_number, r.status);
  select * into r from public.merch_confirm_payment(v_a2, 'TEST-REF-1', 'card');
  v_log := v_log || format(E'\n12 confirm again, same ref: %s  [idempotent]', r.status);
  begin perform public.merch_confirm_payment(v_a2, 'TEST-REF-2', 'card');
    v_log := v_log || E'\n13 confirm with other ref: FAIL accepted';
  exception when others then v_log := v_log || E'\n13 other ref rejected: ' || sqlerrm; end;
  begin perform public.merch_confirm_payment(v_a1, 'TEST-REF-3', 'fpx');
    v_log := v_log || E'\n14 confirm cancelled order: FAIL accepted';
  exception when others then v_log := v_log || E'\n14 cancelled order rejected: ' || sqlerrm; end;
  reset role;

  -- ── organizer (Org A) ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('organizer_id', v_org))::text, true);
  set local role authenticated;
  v_n := public.merch_update_order_status(array[v_a2], 'ready');
  v_log := v_log || format(E'\n15 organizer marks ready: updated %s', v_n);

  -- 063: merch_collect_for_runner is internal; the hand-over runs inside REPC check-in
  begin perform public.merch_collect_for_runner(v_event, v_hafiz);
    v_log := v_log || E'\n15a direct hand-over call: FAIL accepted';
  exception when others then v_log := v_log || E'\n15a direct hand-over call rejected: ' || sqlerrm; end;
  reset role;

  -- 063: hand-over refuses a runner who is not checked in (called as owner, like the wrapper does)
  update public.registrations set checked_in = false where event_id = v_event and runner_id = v_hafiz;
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('organizer_id', v_org))::text, true);
  begin perform public.merch_collect_for_runner(v_event, v_hafiz);
    v_log := v_log || E'\n15b hand-over before check-in: FAIL accepted';
  exception when others then v_log := v_log || E'\n15b hand-over before check-in rejected: ' || sqlerrm; end;
  select bib_number into v_s from public.registrations where event_id = v_event and runner_id = v_hafiz;

  set local role authenticated;
  select * into r from public.repc_check_in_with_merch(v_event, v_hafiz, v_s, false, null, 'TEST');
  v_log := v_log || format(E'\n16 REPC check-in + hand-over: success=%s msg=%s merch=%s  [expect success=true, collected=true items=3]',
    r.success, r.message, r.merch);
  select * into r from public.repc_check_in_with_merch(v_event, v_hafiz, v_s, false, null, 'TEST');
  v_log := v_log || format(E'\n17 re-scan: already_checked_in=%s merch=%s  [expect true, []]', r.already_checked_in, r.merch);

  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
    'app_metadata', json_build_object('organizer_id', gen_random_uuid()))::text, true);
  select * into r from public.repc_check_in_with_merch(v_event, v_hafiz, v_s, false, null, 'TEST');
  v_log := v_log || format(E'\n18 other organizer: success=%s msg=%s merch=%s  [expect false, not allowed, null]',
    r.success, r.message, r.merch);
  reset role;

  select status || ' paid_at=' || (paid_at is not null) || ' ready_at=' || (ready_at is not null)
         || ' collected_at=' || (collected_at is not null) || ' ref=' || payment_ref || ' method=' || payment_method
    into v_s from public.merch_orders where id = v_a2;
  v_log := v_log || E'\n   order: ' || v_s;

  -- ── runner: abu — expiry ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_abu_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_cap_one, 'quantity', 2)), 'fpx');
  v_b1 := r.order_id;
  v_ok := public.merch_cancel_checkout(v_a2);
  v_log := v_log || format(E'\n19 abu cancels hafiz''s order: %s  [expect false]', v_ok);
  reset role;

  select stock into v_n from public.merch_variants where id = v_cap_one;
  update public.merch_orders set expires_at = now() - interval '1 minute' where id = v_b1;
  v_log := v_log || format(E'\n20 abu holds 2 caps (cap stock=%s); expire → released %s', v_n, public.merch_release_expired_orders());
  v_log := v_log || format(E'\n   after expiry: %s, cap stock=%s  [expect cancelled/expired, 5]',
    (select status || '/' || cancel_reason from public.merch_orders where id = v_b1),
    (select stock from public.merch_variants where id = v_cap_one));

  -- ── runner cancel ──
  set local role authenticated;
  select * into r from public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_cap_one, 'quantity', 1)), 'fpx');
  v_ok := public.merch_cancel_checkout(r.order_id);
  v_log := v_log || format(E'\n21 runner cancels: %s, cancels again: %s  [expect true, false]', v_ok, public.merch_cancel_checkout(r.order_id));
  select * into r from public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_cap_one, 'quantity', 2)), 'fpx');
  v_b1 := r.order_id;
  reset role;

  -- ── organizer cancels a reserved pending order ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('organizer_id', v_org))::text, true);
  set local role authenticated;
  perform public.merch_update_order_status(array[v_b1], 'cancelled');
  reset role;
  v_log := v_log || format(E'\n22 organizer cancels reserved pending: %s, cap stock=%s  [expect cancelled/cancelled_by_organizer, 5]',
    (select status || '/' || cancel_reason from public.merch_orders where id = v_b1),
    (select stock from public.merch_variants where id = v_cap_one));

  -- ── unpaid registration ──
  update public.registrations set payment_status = 'pending' where runner_id = v_abu and event_id = v_event;
  perform set_config('request.jwt.claims', json_build_object('sub', v_abu_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.merch_checkout(v_event, jsonb_build_array(jsonb_build_object('variant_id', v_cap_one, 'quantity', 1)), 'fpx');
    v_log := v_log || E'\n23 unpaid runner: FAIL accepted';
  exception when others then v_log := v_log || E'\n23 unpaid runner rejected: ' || sqlerrm; end;
  reset role;

  select string_agg(format('%s %s=%s', p.name, coalesce(v.size, '-'), v.stock), ', ' order by p.name, v.size) into v_s
    from public.merch_variants v join public.merch_products p on p.id = v.product_id where p.event_id = v_event and p.name like 'TEST %';
  v_log := v_log || E'\nFINAL stock: ' || v_s || '  [expect Cap=5, Tee L=0, Tee M=0]';

  raise exception 'TEST RESULTS (all changes rolled back):%', v_log;
end
$test$;
