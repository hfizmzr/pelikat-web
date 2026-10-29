-- ── EVENTS THEME COLUMNS + SLUG (Event Themes P1 — spec docs/event-themes-design.md §4.1, §4.3) ──
-- Adds to events:
--   theme_preset_id  uuid FK → theme_presets ON DELETE SET NULL (076's table),
--                    guarded by trigger events_validate_theme_refs: the referenced
--                    preset must be kind='system' OR owned by events.organizer_id
--                    (anti-IDOR — the plain FK alone would accept ANY preset id).
--   theme_config     jsonb NULL — partial-shape override validated by
--                    validate_theme_tokens(config, false) (non-strict: all-optional).
--   slug             text UNIQUE — kebab-case of the event name capped so that
--                    kebab + '-' + 8-hex md5(id) suffix is always ≤ 64 chars total;
--                    backfilled for ALL existing events; drafts may be NULL,
--                    published/closed events are auto-slugged by trigger
--                    events_published_needs_slug (spec names it for published;
--                    §12.3 makes 'closed' publicly visible too, so it is covered).
-- Trusted writers (postgres / service_role — Django, BFF saveEventTheme after its
-- own ownership verification) bypass the ref-validation trigger, mirroring the 070
-- guard pattern; RLS continues to apply to them as normal.
-- Up: helper function → columns → backfill → unique constraint → trigger
-- functions → triggers. Backfill runs BEFORE the triggers are created so the
-- mass UPDATE does not re-enter them.

-- ══ up ════════════════════════════════════════════════════════════════

-- 1. Shared slug-base derivation (used by the backfill below AND by the
--    auto-slug trigger, so both stay in lockstep). Kebab-case of the name:
--    lowercase, collapse non-[a-z0-9] runs to '-', trim leading/trailing
--    dashes, fall back to 'event' when nothing survives. Capped at 55 so
--    base + '-' + 8-hex suffix ≤ 64 (the slug's total DB cap).
create or replace function public.event_slug_base(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
           coalesce(
             nullif(
               trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')),
               ''
             ),
             'event'
           ),
           55
         )
$$;

-- 2. Columns — one ALTER (single lock pass). theme_config CHECK calls the 076
--    validator POSITIONALLY (p_strict = false → all-optional partial shape);
--    SQL NULL stays legal (no theme), JSON null is not an object → rejected.
alter table public.events
  add column theme_preset_id uuid
    references public.theme_presets (id) on delete set null,
  add column theme_config jsonb
    constraint events_theme_config_valid
    check (theme_config is null or public.validate_theme_tokens(theme_config, false)),
  add column slug text
    constraint events_slug_format
    check (
      slug is null
      or (
        char_length(slug) <= 64
        and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}$'
      )
    );

-- FK support index: preset deletes (ON DELETE SET NULL) and theme joins.
create index events_theme_preset_id_idx on public.events (theme_preset_id);

-- 3. Backfill for ALL existing events: kebab(name) + substr(md5(id::text),1,8).
--    Dedupe-safe: distinct ids → distinct md5 digests, so would-be slugs
--    collide only on an 8-hex prefix coincidence (~1 in 4·10⁹ per pair).
--    Should that ever happen, the 8-hex window slides through the 32-char
--    digest (25 windows) by collision rank — format preserved, still
--    deterministic. The UNIQUE constraint added next is the loud backstop.
with derived as (
  select id, md5(id::text) as digest, public.event_slug_base(name) as base
  from public.events
),
ranked as (
  select
    id,
    base,
    digest,
    -- row_number() is bigint; substr needs int
    (row_number() over (
       partition by base, substr(digest, 1, 8)
       order by id
     ))::int as rn
  from derived
)
update public.events e
set slug = ranked.base || '-'
           || substr(ranked.digest, 1 + ((ranked.rn - 1) % 25), 8)
from ranked
where e.id = ranked.id;

alter table public.events
  add constraint events_slug_key unique (slug);

-- 4. Trigger: anti-IDOR preset reference validation (spec §4.3
--    events_validate_theme_refs). SECURITY INVOKER on purpose: under the
--    caller's own RLS view of theme_presets, a preset hidden from the caller
--    is NOT FOUND → rejected below, closing the FK-bypass (an organizer
--    probing another tenant's preset id can never pass this trigger).
create or replace function public.validate_event_theme_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kind       text;
  v_preset_org uuid;
begin
  -- Trusted writers (postgres, service_role): ownership is verified app-side
  -- (saveEventTheme) or out-of-band (Django) — 070 guard precedent.
  if current_user in ('postgres', 'service_role')
     or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return coalesce(new, old);
  end if;

  if new.theme_preset_id is null then
    return new;
  end if;

  select p.kind, p.organizer_id
    into v_kind, v_preset_org
    from public.theme_presets p
   where p.id = new.theme_preset_id;

  -- NOT FOUND also covers RLS-hidden presets — raise rather than defer to
  -- the FK, which cannot see RLS and would accept the reference.
  if not found then
    raise exception
      'events_validate_theme_refs: theme_preset_id % not found or not permitted',
      new.theme_preset_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Anti-IDOR: preset must be system OR owned by the event's organizer.
  if v_kind <> 'system'
     and v_preset_org is distinct from new.organizer_id then
    raise exception
      'events_validate_theme_refs: preset % is not a system preset and is not owned by the event organizer',
      new.theme_preset_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger events_validate_theme_refs
  before insert or update of theme_preset_id, organizer_id
  on public.events
  for each row
  execute function public.validate_event_theme_refs();

-- 5. Trigger: published (and closed, §12.3 public visibility) events must
--    carry a slug — auto-derive on INSERT or draft→published/closed
--    transition when the caller left it NULL.
create or replace function public.enforce_published_slug()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_candidate text;
  v_taken     boolean;
  v_i         int;
begin
  if new.slug is not null
     or (new.status <> 'published' and new.status <> 'closed') then
    return new;
  end if;

  -- Same derivation as the 077 backfill (kebab + 8-hex md5(id) window);
  -- first non-taken window wins. The UNIQUE constraint remains the final
  -- arbiter under concurrency — worst case the last candidate raises 23505.
  for v_i in 0 .. 24 loop
    v_candidate := public.event_slug_base(new.name)
                   || '-' || substr(md5(new.id::text), 1 + v_i, 8);
    v_taken := null;
    select true
      into v_taken
      from public.events e
     where e.slug = v_candidate;
    exit when v_taken is null;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$$;

create trigger events_published_needs_slug
  before insert or update of slug, status, name
  on public.events
  for each row
  execute function public.enforce_published_slug();

-- ══ down ══════════════════════════════════════════════════════════════
-- drop trigger if exists events_published_needs_slug on public.events;
-- drop function public.enforce_published_slug();
-- drop trigger if exists events_validate_theme_refs on public.events;
-- drop function public.validate_event_theme_refs();
-- alter table public.events
--   drop constraint if exists events_slug_key,
--   drop constraint if exists events_slug_format,
--   drop column if exists slug,
--   drop column if exists theme_config,
--   drop column if exists theme_preset_id;
-- drop function public.event_slug_base(text);
