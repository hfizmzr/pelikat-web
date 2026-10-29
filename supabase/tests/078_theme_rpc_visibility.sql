-- ============================================================================
-- Migration 078 §12.3 visibility matrix — service_role identity carriers.
-- Companion to 078_theme_rpc.sql. Follows the 062 self-contained DO-block
-- convention: run AFTER supabase db reset + seed, e.g.
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f supabase/tests/078_theme_rpc_visibility.sql
-- Leaves NO data behind: fixtures are cleaned in the final verdict block.
-- Every line should read PASS; any FAIL (or the final exception) is a bug.
--
-- Expected lines:
--   A claim.role='service_role'      PASS visible (probe path carrier)
--   B claims.role='service_role'     PASS visible (PostgREST v12 carrier)
--   C SET ROLE service_role          PASS visible (connection SET role carrier)
--   C2 claims garbage                PASS hidden (guarded cast → deny, no error)
--   D claim.role='anon'              PASS hidden (draft, anon)
--   E no carrier (fresh session)     PASS hidden (draft, deny-by-default)
--   F published + anon               PASS visible (§12.3 not over-tightened)
--   G owning organizer               PASS visible (organizer arm intact)
-- ============================================================================

-- ══ fixtures (idempotent: re-created run over run) ══

delete from public.events where id in (
  'd0e5e000-0000-4000-8000-0000000000f2',
  'd0e5e000-0000-4000-8000-0000000000f3');
delete from public.theme_presets where id = 'd0e5e000-0000-4000-8000-0000000000f1';

insert into public.theme_presets (id, slug, name, kind, tokens)
values (
  'd0e5e000-0000-4000-8000-0000000000f1',
  'test078-system-preset',
  'TEST 078 preset',
  'system',
  '{"colors":{"primary":"#9C4A1A","secondary":"#3E2C23","accent":"#D4A017"},"meta":{"version":1}}'::jsonb
);

insert into public.events
  (id, organizer_id, name, event_date, status, theme_preset_id, theme_config)
values
  ('d0e5e000-0000-4000-8000-0000000000f2',
   'd0e5e000-0000-4000-8000-000000000011',       -- seed org1 (KL City Runners)
   'TEST 078 draft event',
   current_date + 1,
   'draft',
   'd0e5e000-0000-4000-8000-0000000000f1',
   '{"vocabulary":{"medal_label":"TestMedal"}}'::jsonb),
  ('d0e5e000-0000-4000-8000-0000000000f3',
   'd0e5e000-0000-4000-8000-000000000011',
   'TEST 078 published event',
   current_date + 1,
   'published',
   'd0e5e000-0000-4000-8000-0000000000f1',
   null);

create temp table test078_results (scenario text, ok boolean, detail text)
  on commit preserve rows;

-- One scenario = evaluate the RPC under the CURRENT session identity, record
-- PASS/FAIL. SECURITY DEFINER + pinned search_path: scenario C switches
-- current role to service_role mid-transaction, and the roles' default
-- privileges on another session's temp tables don't include writes — the
-- bookkeeping must survive that (definer runs as the script owner). On
-- visible cases the merged vocabulary + preset color prove the preset join
-- resolved (definer path) → tokens ⊕ config.
create or replace function pg_temp.test078_case(
  p_scenario text, p_expect_visible boolean, p_event uuid default 'd0e5e000-0000-4000-8000-0000000000f2',
  p_check_vocab boolean default true
) returns void
language plpgsql
security definer
set search_path = pg_temp, public
as $$
declare
  v_tokens jsonb := public.get_event_theme(p_event);
  v_ok boolean;
  v_detail text;
begin
  if p_expect_visible then
    v_ok := v_tokens is distinct from null
      and v_tokens -> 'colors' ->> 'primary' = '#9C4A1A'
      and v_tokens -> 'colors' ->> 'secondary' = '#3E2C23'
      and (not p_check_vocab or v_tokens -> 'vocabulary' ->> 'medal_label' = 'TestMedal');
  else
    v_ok := v_tokens is null;
  end if;
  v_detail := coalesce(v_tokens::text, 'NULL (hidden)');
  insert into test078_results values (p_scenario, v_ok, v_detail);
  if v_ok then
    raise notice 'PASS: %  [%]', p_scenario, v_detail;
  else
    raise warning 'FAIL: %  [%]', p_scenario, v_detail;
  end if;
end;
$$;

-- A: carrier (a) — claim.role GUC (the probe path)
do $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform pg_temp.test078_case('A claim.role service_role', true);
end$$;

-- B: carrier (b) — PostgREST v12 normalized claims JSON (claim.role NOT set)
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role","sub":"x"}', true);
  perform pg_temp.test078_case('B claims.role service_role', true);
end$$;

-- C: carrier (c) — connection SET ROLE model (no claim GUCs)
do $$
begin
  execute 'set local role service_role';
  perform pg_temp.test078_case('C SET ROLE service_role', true);
end$$;

-- C2: garbage claims payload → guarded cast → deny (no error raised)
do $$
begin
  perform set_config('request.jwt.claims', 'not-json{{', true);
  perform pg_temp.test078_case('C2 claims garbage', false);
end$$;

-- D: anon claim — hidden (draft)
do $$
begin
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform pg_temp.test078_case('D claim.role anon', false);
end$$;

-- E: fresh session, no carriers — hidden (draft, deny-by-default)
do $$
begin
  perform pg_temp.test078_case('E no carrier', false);
end$$;

-- F: spec §12.3 — published events resolve for everyone (draft-hardening must
-- not have over-tightened the public path)
do $$
begin
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform pg_temp.test078_case(
    'F published + anon', true,
    'd0e5e000-0000-4000-8000-0000000000f3', false);
end$$;

-- G: owning organizer (claims sub + app_metadata) — draft visible through the
-- organizer arm of the gate
do $$
declare
  v_user uuid;
begin
  select u.id into v_user
    from auth.users u
   where u.raw_app_meta_data ->> 'organizer_id'
         = 'd0e5e000-0000-4000-8000-000000000011' limit 1;
  if v_user is null then
    insert into test078_results values(
      'G owning organizer', false, 'no seeded org1 user — seed missing?');
    raise warning 'FAIL: G owning organizer (no seeded org1 user)';
  else
    perform set_config('request.jwt.claims',
      json_build_object(
        'sub', v_user,
        'role', 'authenticated',
        'app_metadata', json_build_object(
          'organizer_id', 'd0e5e000-0000-4000-8000-000000000011'))::text,
      true);
    perform pg_temp.test078_case('G owning organizer', true);
  end if;
end$$;

-- ══ verdict — aborts the script (exit ≠ 0) on any FAIL; cleans fixtures on success ══
do $$
declare
  v_failures int;
  v_total int;
begin
  select count(*) filter (where not ok), count(*) into v_failures, v_total
    from test078_results;
  if v_failures > 0 then
    raise exception '078 §12.3 matrix: %/% scenarios FAILED — see FAIL lines above',
      v_failures, v_total;
  end if;
  raise notice '078 §12.3 matrix: %/% scenarios PASSED', v_total, v_total;
  delete from public.events where id in (
    'd0e5e000-0000-4000-8000-0000000000f2',
    'd0e5e000-0000-4000-8000-0000000000f3');
  delete from public.theme_presets where id = 'd0e5e000-0000-4000-8000-0000000000f1';
end$$;
