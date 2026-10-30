-- ============================================================================
-- Migration 084 flow test: FR-29 registration confirmation, FR-30 results
-- published, FR-32 organizer broadcast, FR-31 push subscriptions, RLS and the
-- dispatcher claim.
--
-- Run in the Supabase SQL editor (or execute_sql with write access) AFTER 084
-- is applied. Leaves NO data behind: everything happens in one DO block that
-- ends with RAISE EXCEPTION, so the whole transaction is rolled back (pg_net
-- requests queued by the kick trigger are rolled back with it). The exception
-- message is the test report; any line containing "FAIL" is a bug.
--
-- Uses the seeded events (supabase/seed.sql):
--   d0e5…023 Putrajaya Heritage Half Marathon (physical, results unpublished)
--   d0e5…026 Virtual 21K Speed Challenge      (virtual,  results unpublished)
-- Callers are impersonated by setting request.jwt.claims + SET LOCAL ROLE.
-- ============================================================================

do $test$
declare
  v_phys uuid := 'd0e5e000-0000-4000-8000-000000000023';
  v_virt uuid := 'd0e5e000-0000-4000-8000-000000000026';
  v_org uuid;
  v_org_user uuid;
  v_reg uuid; v_runner_user uuid; v_bib text;
  v_vreg uuid;
  v_other_user uuid;
  v_recipients int;
  v_log text := '';
  r record; v_n int; v_s text; v_b uuid;
begin
  select organizer_id into v_org from public.events where id = v_phys;
  select u.id into v_org_user from auth.users u where u.raw_app_meta_data ->> 'organizer_id' = v_org::text limit 1;
  select count(*) into v_recipients from public.notification_recipients(v_phys);

  -- a paid physical registration with a BIB and a runner account
  select r.id, rp.user_id, r.bib_number into v_reg, v_runner_user, v_bib
    from public.registrations r join public.runner_profiles rp on rp.id = r.runner_id
   where r.event_id = v_phys and r.payment_status = 'paid' and r.bib_number is not null
   limit 1;
  select r.id into v_vreg from public.registrations r
   where r.event_id = v_virt and r.payment_status = 'paid' and r.runner_id is not null limit 1;
  select rp.user_id into v_other_user from public.runner_profiles rp
   where rp.user_id <> v_runner_user and rp.user_id is not null limit 1;

  v_log := v_log || format(E'\n00 setup: org_user=%s runner=%s reg=%s vreg=%s recipients=%s',
    v_org_user is not null, v_runner_user is not null, v_reg is not null, v_vreg is not null, v_recipients);

  -- ── FR-29: payment-first BIB ──
  update public.registrations set payment_status = 'pending', bib_number = null where id = v_reg;
  update public.registrations set payment_status = 'paid' where id = v_reg;
  select count(*) into v_n from public.notifications where registration_id = v_reg;
  v_log := v_log || format(E'\n01 paid but no BIB yet: %s notifications  [expect 0]', v_n);

  update public.registrations set bib_number = v_bib where id = v_reg;
  select * into r from public.notifications where registration_id = v_reg and kind = 'registration_confirmed';
  v_log := v_log || format(E'\n02 BIB assigned: user=%s email=%s/%s push=%s body="%s" url=%s  [expect own user, pending, pending, BIB in body, …/bib]',
    r.user_id = v_runner_user, r.email is not null, r.email_status, r.push_status, r.body, r.url);

  update public.registrations set bib_number = v_bib where id = v_reg;
  update public.registrations set payment_status = 'paid' where id = v_reg;
  select count(*) into v_n from public.notifications where registration_id = v_reg and kind = 'registration_confirmed';
  v_log := v_log || format(E'\n03 re-updates: %s confirmation rows  [expect 1]', v_n);

  update public.registrations set payment_status = 'pending' where id = v_vreg;
  update public.registrations set payment_status = 'paid' where id = v_vreg;
  select * into r from public.notifications where registration_id = v_vreg and kind = 'registration_confirmed';
  v_log := v_log || format(E'\n04 virtual paid: found=%s bib=%s url=%s  [expect true, <NULL>, /runner/events/<id>]',
    r.id is not null, r.data ->> 'bib_number', r.url);

  -- ── FR-30: results published ──
  update public.events set results_published = true where id = v_phys;
  select count(*) into v_n from public.notifications where event_id = v_phys and kind = 'results_published';
  v_log := v_log || format(E'\n05 publish results: %s rows  [expect %s]', v_n, v_recipients);
  update public.events set results_published = false where id = v_phys;
  update public.events set results_published = true where id = v_phys;
  select count(*) into v_n from public.notifications where event_id = v_phys and kind = 'results_published';
  v_log := v_log || format(E'\n06 unpublish + republish: %s rows  [expect %s, no duplicates]', v_n, v_recipients);

  -- ── FR-32: broadcast as the organizer ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'organizer', 'organizer_id', v_org))::text, true);
  set local role authenticated;

  select * into r from public.send_event_broadcast(v_phys, '  Kit pickup moved  ', 'Hall B, 9am.', true, false);
  v_b := r.broadcast_id;
  v_log := v_log || format(E'\n07 broadcast: recipients=%s  [expect %s]', r.recipient_count, v_recipients);

  begin perform public.send_event_broadcast(v_phys, 'Again', 'Too soon', true, true);
    v_log := v_log || E'\n08 second broadcast within a minute: FAIL accepted';
  exception when others then v_log := v_log || E'\n08 second broadcast rejected: ' || sqlerrm; end;

  begin perform public.send_event_broadcast(v_virt, 'x', 'y', true, true);
    v_log := v_log || E'\n09 broadcast to another organizer''s event: FAIL accepted';
  exception when others then v_log := v_log || E'\n09 other organizer''s event rejected: ' || sqlerrm; end;

  select string_agg(format('%s/%s', subject, recipient_count), ',') into v_s from public.get_event_broadcasts(v_phys);
  v_log := v_log || format(E'\n10 history: %s  [expect "Kit pickup moved/%s" (trimmed)]', v_s, v_recipients);

  select count(*) into v_n from public.notifications;
  v_log := v_log || format(E'\n11 organizer reads notifications directly: %s rows  [expect 0]', v_n);
  reset role;

  select count(*) filter (where email_status = 'pending'), count(*) filter (where push_status = 'pending')
    into v_n, v_s from public.notifications where broadcast_id = v_b;
  v_log := v_log || format(E'\n12 broadcast channels: email pending=%s push pending=%s  [expect %s, 0 (push off)]', v_n, v_s, v_recipients);

  -- ── runner: RLS + read receipts + push ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_runner_user, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*), count(*) filter (where user_id <> v_runner_user) into v_n, v_s from public.notifications;
  v_log := v_log || format(E'\n13 runner inbox: %s rows, %s foreign  [expect >=3 (confirmed, results, broadcast), 0]', v_n, v_s);

  update public.notifications set read_at = now() where read_at is null;
  get diagnostics v_n = row_count;
  v_log := v_log || format(E'\n14 mark all read: %s rows  [expect same as 13]', v_n);

  begin update public.notifications set title = 'hacked';
    v_log := v_log || E'\n15 update title: FAIL accepted';
  exception when others then v_log := v_log || E'\n15 update title rejected: ' || sqlerrm; end;

  begin perform public.send_event_broadcast(v_phys, 'x', 'y', true, true);
    v_log := v_log || E'\n16 runner broadcast: FAIL accepted';
  exception when others then v_log := v_log || E'\n16 runner broadcast rejected: ' || sqlerrm; end;

  begin perform public.save_push_subscription('https://169.254.169.254/latest', repeat('A', 87), repeat('B', 22));
    v_log := v_log || E'\n17 SSRF endpoint: FAIL accepted';
  exception when others then v_log := v_log || E'\n17 SSRF endpoint rejected: ' || sqlerrm; end;

  perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/TEST-084', repeat('A', 87), repeat('B', 22), 'flow-test');
  select count(*) into v_n from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/TEST-084';
  v_log := v_log || format(E'\n18 save push subscription: visible=%s  [expect 1]', v_n);

  perform public.send_test_notification();
  begin perform public.send_test_notification();
    v_log := v_log || E'\n19 second test push: FAIL accepted';
  exception when others then v_log := v_log || E'\n19 second test push rejected: ' || sqlerrm; end;

  begin perform public.claim_notification_jobs(10);
    v_log := v_log || E'\n20 runner claims jobs: FAIL accepted';
  exception when others then v_log := v_log || E'\n20 runner claim rejected: ' || sqlerrm; end;
  reset role;

  -- same device, different account: endpoint moves to the new user
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/TEST-084', repeat('C', 87), repeat('D', 22));
  reset role;
  select count(*) into v_n from public.push_subscriptions
   where endpoint = 'https://fcm.googleapis.com/fcm/send/TEST-084' and user_id = v_other_user;
  v_log := v_log || format(E'\n21 device re-login moves subscription: %s  [expect 1]', v_n);

  -- ── dispatcher claim (service side) ──
  select count(*), min(attempts) into v_n, v_s from public.claim_notification_jobs(500);
  v_log := v_log || format(E'\n22 claim: %s rows, min attempts=%s  [expect >0, 1]', v_n, v_s);
  select count(*) into v_n from public.claim_notification_jobs(500);
  v_log := v_log || format(E'\n23 immediate re-claim: %s rows  [expect 0, leased]', v_n);

  raise exception 'TEST RESULTS (all changes rolled back):%', v_log;
end
$test$;
