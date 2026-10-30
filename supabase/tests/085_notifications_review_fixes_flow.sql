-- ============================================================================
-- Migration 085 flow test: what the PR #39 review fixes add on top of 084.
--   - send_event_broadcast refuses a send that reaches nobody
--   - send_event_broadcast takes the per-event advisory lock
--   - a notification failure no longer rolls back a payment/BIB update
--
-- Run in the Supabase SQL editor (or execute_sql with write access) AFTER 085
-- is applied. Same contract as 084_notifications_flow.sql: one DO block that
-- ends with RAISE EXCEPTION, so everything (including the temporary check
-- constraint below and any queued pg_net requests) is rolled back. The
-- exception message is the test report; any line containing "FAIL" is a bug.
--
-- Uses seeded events (supabase/seed.sql), both owned by the same organizer:
--   d0e5…027 JB Ultra Marathon 2027        (has one email-only guest)
--   d0e5…023 Putrajaya Heritage Half Marathon
-- Two simultaneous broadcasts need two sessions, so the lock is checked by
-- looking for it in pg_locks rather than by racing two sends.
-- ============================================================================

do $test$
declare
  v_jb uuid := 'd0e5e000-0000-4000-8000-000000000027';
  v_phys uuid := 'd0e5e000-0000-4000-8000-000000000023';
  v_org uuid;
  v_org_user uuid;
  v_guests int;
  v_reg uuid; v_bib text;
  v_log text := '';
  r record; v_n int; v_s text;
  v_key bigint;
begin
  select organizer_id into v_org from public.events where id = v_jb;
  select u.id into v_org_user from auth.users u where u.raw_app_meta_data ->> 'organizer_id' = v_org::text limit 1;
  select count(*) into v_guests from public.registrations reg
   where reg.event_id = v_jb and reg.runner_id is null and reg.guest_email is not null
     and reg.payment_status in ('paid', 'waived');
  v_log := v_log || format(E'\n00 setup: org_user=%s same organizer=%s email-only guests on JB=%s  [expect t, t, >=1]',
    v_org_user is not null, v_org = (select organizer_id from public.events where id = v_phys), v_guests);

  -- ── zero recipients: only email-only guests left, email off ──
  update public.registrations set payment_status = 'pending'
   where event_id = v_jb and runner_id is not null and payment_status in ('paid', 'waived');

  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'organizer', 'organizer_id', v_org))::text, true);
  set local role authenticated;

  begin perform public.send_event_broadcast(v_jb, 'Push only', 'Nobody can get this', false, true);
    v_log := v_log || E'\n01 push-only to guests-only event: FAIL accepted';
  exception when others then v_log := v_log || E'\n01 push-only to guests-only event rejected: ' || sqlerrm; end;

  select count(*) into v_n from public.event_broadcasts where event_id = v_jb;
  v_log := v_log || format(E'\n02 broadcast rows left behind: %s  [expect 0]', v_n);

  select * into r from public.send_event_broadcast(v_jb, 'With email', 'Guests get this one', true, false);
  v_log := v_log || format(E'\n03 same event with email on: recipients=%s  [expect %s]', r.recipient_count, v_guests);
  reset role;

  -- ── advisory lock taken by the send above (held until commit) ──
  -- a bigint advisory key shows up split into classid (high 32 bits) / objid (low 32 bits)
  v_key := hashtextextended('event_broadcast:' || v_jb::text, 0);
  select count(*) into v_n from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid() and granted
     and classid = ((v_key >> 32) & 4294967295)::oid
     and objid = (v_key & 4294967295)::oid;
  v_log := v_log || format(E'\n04 per-event advisory lock held by this transaction: %s  [expect 1]', v_n);

  -- ── containment: queuing the notification fails, the payment still lands ──
  select reg.id, reg.bib_number into v_reg, v_bib from public.registrations reg
   where reg.event_id = v_phys and reg.payment_status = 'paid' and reg.bib_number is not null
     and reg.runner_id is not null
   limit 1;
  update public.registrations set payment_status = 'pending', bib_number = null where id = v_reg;

  -- every insert into notifications now fails (NOT VALID still checks new rows)
  alter table public.notifications add constraint flow_test_block_inserts check (false) not valid;

  begin
    update public.registrations set payment_status = 'paid', bib_number = v_bib where id = v_reg;
    get diagnostics v_n = row_count;
    select payment_status || '/' || coalesce(bib_number, '<NULL>') into v_s from public.registrations where id = v_reg;
    v_log := v_log || format(E'\n05 payment + BIB with notifications broken: updated=%s now=%s  [expect 1, paid/%s]', v_n, v_s, v_bib);
  exception when others then
    v_log := v_log || E'\n05 payment + BIB with notifications broken: FAIL update rolled back: ' || sqlerrm;
  end;

  select count(*) into v_n from public.notifications where registration_id = v_reg;
  v_log := v_log || format(E'\n06 notification for that registration: %s  [expect 0, only a warning logged]', v_n);

  raise exception 'TEST RESULTS (all changes rolled back):%', v_log;
end
$test$;
