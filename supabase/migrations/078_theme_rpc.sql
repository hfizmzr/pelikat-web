-- ── THEME RESOLUTION RPC (Event Themes P1 — spec docs/event-themes-design.md §4.3, §9) ──
-- jsonb_deep_merge(a, b): IMMUTABLE deep merge — b (the event's theme_config)
-- wins; a JSON null in the override REMOVES that key from the result at any
-- depth (jsonb_strip_nulls semantics → the platform default survives at
-- render); preset-side nulls are stripped identically. Two objects merge
-- key-by-key recursively; scalar/array overrides replace wholesale.
-- get_event_theme(event_id): single canonical resolution point (spec §4.3) —
--   preset.tokens ⊕ events.theme_config. SECURITY DEFINER so public pages (and
--   later the Django cert pipeline via service_role) can resolve a theme
--   without reading the events row. Visibility (spec §12.3): published/closed
--   → everyone; draft → owning organizer, platform admin, or service_role
--   only. Denial returns NULL — indistinguishable from "no theme", so the RPC
--   never leaks draft existence.
-- SECURITY DEFINER note: current_user switches to the function owner inside
-- the call, so the caller is identified via JWT claims only — 077's
-- current_user-based trusted-writer bypass does NOT transfer here (that
-- trigger is security invoker). Helpers get_my_organizer_id() / is_admin()
-- are referenced schema-qualified, which is valid under the pinned empty
-- search_path; their bodies only touch the schema-qualified auth.jwt().
-- No is_active filter: spec §4.3 defines resolution purely as tokens ⊕ config.
-- Up: merge function → RPC → revoke from public → explicit grants.

-- ══ up ════════════════════════════════════════════════════════════════

create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base  jsonb := jsonb_strip_nulls(a);  -- a-side nulls mean "no value"
  v_patch jsonb := b;
  v_key   text;
  v_val   jsonb;
begin
  if v_base is null and v_patch is null then
    return null;                          -- no preset, no config → no theme
  end if;

  if v_base is null then
    v_base := '{}'::jsonb;                -- merge the override onto nothing
  end if;
  if v_patch is null then
    return v_base;                        -- no override → preset as-is
  end if;

  -- Only an object override merges key-by-key; scalar/array override replaces
  -- the whole document (event wins).
  if jsonb_typeof(v_patch) <> 'object' then
    return v_patch;
  end if;
  if jsonb_typeof(v_base) <> 'object' then
    v_base := '{}'::jsonb;
  end if;

  for v_key, v_val in
    select e.key, e.value from jsonb_each(v_patch) as e(key, value)
  loop
    if jsonb_typeof(v_val) = 'null' then
      -- jsonb_strip_nulls semantics (spec §4.3): a null OVERRIDE removes the
      -- key from the result → the platform default survives at render.
      -- Applies at any depth via the recursion below.
      v_base := v_base - v_key;
    elsif jsonb_typeof(v_val) = 'object'
          and jsonb_typeof(v_base -> v_key) = 'object' then
      -- both sides hold objects → recurse (deep, not shallow). Absent base
      -- key yields SQL NULL → typeof NULL ≠ 'object' → falls to the else arm
      -- and the object is set as-is.
      v_base := jsonb_set(v_base, array[v_key],
                          public.jsonb_deep_merge(v_base -> v_key, v_val));
    else
      v_base := jsonb_set(v_base, array[v_key], v_val);
    end if;
  end loop;

  return v_base;
end;
$$;

create or replace function public.get_event_theme(event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status       text;
  v_organizer_id uuid;
  v_tokens       jsonb;
  v_config       jsonb;
  v_caller_org   uuid;
begin
  select e.status, e.organizer_id, e.theme_config, p.tokens
    into v_status, v_organizer_id, v_config, v_tokens
    from public.events e
    left join public.theme_presets p on p.id = e.theme_preset_id
   where e.id = event_id;

  if not found then
    return null;                          -- unknown event → no theme
  end if;

  -- Visibility gate (spec §4.3 / §12.3): published and closed events are
  -- public; drafts resolve only for the owning organizer, a platform admin,
  -- or service_role (service_role detected via its JWT claim — see the
  -- SECURITY DEFINER note in the header).
  -- NULL discipline (Task 14 hardening): both columns are nullable, so the
  -- comparisons use IS DISTINCT FROM / explicit NULL arms — a plain
  -- `v_status <> 'published'` or `v_caller_org <> v_organizer_id` yields
  -- NULL (→ gate skipped → theme RESOLVED) for a NULL-status or
  -- NULL-organizer event. Distinct-from treats NULL as "not public", so
  -- degenerate rows deny by default, exactly like a draft.
  if v_status is distinct from 'published' and v_status is distinct from 'closed' then
    v_caller_org := public.get_my_organizer_id();
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
       and not coalesce(public.is_admin(), false)
       and (v_organizer_id is null or v_caller_org is null
            or v_caller_org <> v_organizer_id) then
      return null;
    end if;
  end if;

  return public.jsonb_deep_merge(v_tokens, v_config);
end;
$$;

-- Execute privilege: a fresh function is executable by PUBLIC by default —
-- revoke first, then grant explicitly to the three PostgREST roles (spec §9
-- "RPC escalation" mitigation: read-only, pinned search_path, explicit
-- grants after revoke).
revoke all on function public.get_event_theme(uuid) from public;

grant execute on function public.get_event_theme(uuid)
  to anon, authenticated, service_role;

-- jsonb_deep_merge is a pure helper, kept OUT of the public API surface:
-- Supabase default privileges grant EXECUTE on new functions to the API roles
-- (verified in §4 of the verification output), so it is revoked explicitly.
revoke all on function public.jsonb_deep_merge(jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- ══ down ══════════════════════════════════════════════════════════════
-- revoke all on function public.get_event_theme(uuid) from anon, authenticated, service_role;
-- revoke all on function public.jsonb_deep_merge(jsonb, jsonb) from public, anon, authenticated, service_role;
-- drop function public.get_event_theme(uuid);
-- drop function public.jsonb_deep_merge(jsonb, jsonb);
