-- ── SLUG BASE TRAILING-DASH REPAIR (CodeRabbit Major, T4) ──
-- 077's event_slug_base applied left(…, 55) AFTER trimming dashes, so when
-- character 55 was '-' the base ended with a dash. Appending the '-<8hex>'
-- suffix then produced '--' inside the slug, which events_slug_format
-- ('^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{8}$') rejects — aborting the 077
-- backfill and the events_published_needs_slug auto-slug for such names.
-- shipped as a NEW migration (not an edit to 077): 077 was already applied
-- to the cloud DB (041-style history), so keeping repo history truthful
-- means repairing the function here; `create or replace` fixes the shared
-- body in place for cloud too — the 077 backfill formula and
-- events_published_needs_slug both call this one function, so they are
-- repaired by replacement. The fix only affects future derivations; the
-- derivation is deterministic, so re-deriving for existing rows yields the
-- same slugs (idempotent, no 23505).
-- Replay safety: a fresh replay cannot abort at 077 before this repair —
-- at 077 time the only preexisting events come from the in-repo seed
-- (verified empirically: 0/10 seed names yield a trailing-dash base under
-- the buggy body), so no CHECK-violating slug exists at that point.
-- Semantics unchanged: lowercase kebab of the name, ≤ 55 chars, non-empty,
-- fall back to 'event' — plus (new) trailing dashes trimmed AFTER the
-- 55-cap and the fallback moved after the cap to also cover the degenerate
-- all-dash-at-the-boundary case.

-- ══ up ════════════════════════════════════════════════════════════════
create or replace function public.event_slug_base(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           nullif(
             btrim(
               left(
                 coalesce(
                   nullif(
                     trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')),
                     ''
                   ),
                   'event'
                 ),
                 55
               ),
               '-'
             ),
             ''
           ),
           'event'
         )
$$;

-- ══ down ══════════════════════════════════════════════════════════════
-- Intentionally no-op (commented): dropping the repaired function would
-- only restore the buggy 077 body used by live callers (backfill column
-- default paths, events_published_needs_slug) — a pointless regression.
-- drop function public.event_slug_base(text);
