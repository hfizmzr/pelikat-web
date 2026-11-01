-- ============================================================================
-- Migration 091 flow test: REPC check-in / merch hand-over require an ACTIVE
-- organizer (organizers.is_active), not just a matching JWT organizer_id.
--
-- Run in the Supabase SQL editor (or execute_sql with write access) AFTER 091
-- is applied. Same contract as 085_notifications_review_fixes_flow.sql: one
-- DO block that ends with RAISE EXCEPTION, so everything (including the
-- temporary is_active flip below) is rolled back. The exception message is
-- the test report; any line containing "FAIL" is a bug.
--
-- Uses seeded data (supabase/seed.sql):
--   d0e5…021 KL City Night Run 2026 (KL City Runners), runner d0e5…052 /
--   bib N10-002 is already checked in, so the active path returns
--   "already checked in" without writing anything.
--   d0e5…026 Virtual 21K (Penang Pacers) supplies a second organizer id.
--
-- merch_collect_for_runner is internal only since 063 (no execute for
-- authenticated): callers reach it through repc_check_in_with_merch. Its
-- inactive-organizer guard sits behind the check-in guard on that path, so
-- check 05 calls it directly as the session owner with the organizer's JWT
-- claims set (auth.jwt() reads the claims, not the role).
-- ============================================================================

do $test$
declare
  v_event uuid := 'd0e5e000-0000-4000-8000-000000000021';
  v_runner uuid := 'd0e5e000-0000-4000-8000-000000000052';
  v_bib text := 'N10-002';
  v_org uuid;
  v_other_org uuid;
  v_org_user uuid;
  v_admin uuid;
  v_log text := '';
  r record;
begin
  select organizer_id into v_org from public.events where id = v_event;
  select organizer_id into v_other_org from public.events where id = 'd0e5e000-0000-4000-8000-000000000026';
  select u.id into v_org_user from auth.users u where u.raw_app_meta_data ->> 'organizer_id' = v_org::text limit 1;
  select u.id into v_admin from auth.users u where u.raw_app_meta_data ->> 'role' = 'admin' limit 1;
  v_log := v_log || format(E'\n00 setup: org_user=%s admin=%s other org differs=%s active=%s checked_in=%s  [expect t, t, t, t, t]',
    v_org_user is not null, v_admin is not null, v_other_org <> v_org,
    (select is_active from public.organizers where id = v_org),
    (select checked_in from public.registrations where event_id = v_event and runner_id = v_runner and bib_number = v_bib));

  -- ── active organizer: allowed ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'organizer', 'organizer_id', v_org))::text, true);
  set local role authenticated;

  select * into r from public.repc_check_in_registration(v_event, v_runner, v_bib);
  v_log := v_log || format(E'\n01 active organizer check-in: success=%s message=%s  [expect t, Runner is already checked in]', r.success, r.message);

  select * into r from public.repc_check_in_with_merch(v_event, v_runner, v_bib);
  v_log := v_log || format(E'\n02 active organizer check-in with merch: success=%s merch ran=%s  [expect t, t]',
    r.success, r.merch is not null);

  begin perform public.merch_collect_for_runner(v_event, v_runner);
    v_log := v_log || E'\n02b direct merch_collect_for_runner as authenticated: FAIL allowed (063 made it internal only)';
  exception when insufficient_privilege then v_log := v_log || E'\n02b direct merch_collect_for_runner as authenticated refused  [expect refused]'; end;

  -- ── another organizer's event: still refused by the ownership check ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'organizer', 'organizer_id', v_other_org))::text, true);
  select * into r from public.repc_check_in_registration(v_event, v_runner, v_bib);
  v_log := v_log || format(E'\n03 other organizer check-in: success=%s message=%s  [expect f, Not allowed to check in this registration]', r.success, r.message);
  reset role;

  -- ── same organizer, now inactive (stale JWT still says organizer) ──
  update public.organizers set is_active = false where id = v_org;
  perform set_config('request.jwt.claims', json_build_object('sub', v_org_user, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'organizer', 'organizer_id', v_org))::text, true);
  set local role authenticated;

  select * into r from public.repc_check_in_registration(v_event, v_runner, v_bib);
  v_log := v_log || format(E'\n04 inactive organizer check-in: success=%s message=%s  [expect f, Organizer subscription is not active]', r.success, r.message);

  reset role;
  begin perform public.merch_collect_for_runner(v_event, v_runner);
    v_log := v_log || E'\n05 inactive organizer merch hand-over (internal call): FAIL allowed';
  exception when others then v_log := v_log || E'\n05 inactive organizer merch hand-over (internal call) refused: ' || sqlerrm || '  [expect Organizer subscription is not active]'; end;
  set local role authenticated;

  select * into r from public.repc_check_in_with_merch(v_event, v_runner, v_bib);
  v_log := v_log || format(E'\n06 inactive organizer check-in with merch: success=%s message=%s merch=%s  [expect f, Organizer subscription is not active, <NULL>]',
    r.success, r.message, coalesce(r.merch::text, '<NULL>'));

  -- ── admin is unaffected by the organizer's inactive state ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'admin'))::text, true);
  select * into r from public.repc_check_in_registration(v_event, v_runner, v_bib);
  v_log := v_log || format(E'\n07 admin check-in on inactive organizer event: success=%s message=%s  [expect t, Runner is already checked in]', r.success, r.message);

  select * into r from public.repc_check_in_with_merch(v_event, v_runner, v_bib);
  v_log := v_log || format(E'\n08 admin check-in with merch on inactive organizer event: success=%s merch ran=%s  [expect t, t]',
    r.success, r.merch is not null);
  reset role;

  -- ── grants survived create or replace (merch_collect stays internal, 063) ──
  v_log := v_log || format(E'\n09 authenticated can execute: check_in=%s merch_collect=%s with_merch=%s  [expect t, f, t]',
    has_function_privilege('authenticated', 'public.repc_check_in_registration(uuid, uuid, text, boolean, text, text)', 'execute'),
    has_function_privilege('authenticated', 'public.merch_collect_for_runner(uuid, uuid)', 'execute'),
    has_function_privilege('authenticated', 'public.repc_check_in_with_merch(uuid, uuid, text, boolean, text, text)', 'execute'));

  raise exception 'TEST REPORT (rolled back)%', v_log;
end
$test$;
