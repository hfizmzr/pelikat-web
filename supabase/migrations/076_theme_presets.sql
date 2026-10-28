-- ── THEME PRESETS (Event Themes P1 — spec docs/event-themes-design.md §4.1, §4.3) ──
-- theme_presets: platform-seeded 'system' presets + per-organizer custom presets.
-- validate_theme_tokens(jsonb, p_strict): single validation choke-point, wired into
-- the theme_presets.tokens CHECK (p_strict = true). Migration 077 reuses it with
-- p_strict = false for all-optional events.theme_config overrides.
-- Enforces (spec §4.3): 64 KB JSON cap, object shape, unknown-key rejection at
-- every level, HEX ^#[0-9a-fA-F]{6}$, https-only font URLs, bucket-path-or-https
-- assets with '..' + charset [A-Za-z0-9/_.-] rejection, 6-key vocabulary
-- whitelist with 64-char DB cap (UI enforces 40), meta {"version": 1} exactly
-- (required in p_strict mode). No seeds here — 079 owns the 6 system presets.
-- Up: create function first (the table CHECK references it), then table,
-- index, RLS policies, grants.

-- ══ up ════════════════════════════════════════════════════════════════

create or replace function public.validate_theme_tokens(tokens jsonb, p_strict boolean)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_meta    jsonb;
  v_section jsonb;
  v_key     text;
  v_val     jsonb;
  v_text    text;

  c_top_keys   text[] := array['colors', 'typography', 'assets', 'vocabulary', 'meta'];
  c_color_keys text[] := array['primary', 'secondary', 'accent', 'background', 'foreground', 'ring'];
  c_typo_keys  text[] := array['heading_font_url', 'body_font_url'];
  c_asset_keys text[] := array['banner_url', 'logo_url', 'badge_icon_url', 'certificate_background_url'];
  c_vocab_keys text[] := array['bib_label', 'checkpoint_label', 'medal_label', 'run_label',
                                 'participant_label', 'certificate_label'];
  c_hex        text   := '^#[0-9a-fA-F]{6}$';
begin
  p_strict := coalesce(p_strict, false);

  -- 64 KB JSON cap
  if octet_length(tokens::text) > 65536 then
    return false;
  end if;

  -- must be a JSON object
  if jsonb_typeof(tokens) <> 'object' then
    return false;
  end if;

  -- unknown top-level keys rejected
  if exists (
    select 1 from jsonb_object_keys(tokens) as k(key)
    where not (k.key = any (c_top_keys))
  ) then
    return false;
  end if;

  -- meta: {"version": 1} exactly — extra keys rejected; version must be the
  -- JSON number 1 (string "1" or other versions rejected). Required in p_strict
  -- mode; optional but validated in partial (non-p_strict) mode.
  v_meta := tokens -> 'meta';
  if v_meta is not null then
    if jsonb_typeof(v_meta) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_meta) as k(key) where k.key <> 'version'
    ) then
      return false;
    end if;
    if v_meta -> 'version' is null or (v_meta -> 'version') <> '1'::jsonb then
      return false;
    end if;
  elsif p_strict then
    return false;
  end if;

  -- colors: known keys only, every value a HEX string.
  -- p_strict mode: section required; primary/secondary/accent required (§4.2).
  v_section := tokens -> 'colors';
  if v_section is not null then
    if jsonb_typeof(v_section) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_section) as k(key)
      where not (k.key = any (c_color_keys))
    ) then
      return false;
    end if;
    for v_key, v_val in
      select e.k, e.v from jsonb_each(v_section) as e(k, v)
    loop
      if jsonb_typeof(v_val) <> 'string' then
        return false;
      end if;
      if v_val #>> '{}' !~ c_hex then
        return false;
      end if;
    end loop;
    if p_strict
       and not (v_section ? 'primary' and v_section ? 'secondary' and v_section ? 'accent') then
      return false;
    end if;
  elsif p_strict then
    return false;
  end if;

  -- typography: known keys only, https-only URLs (spec §4.3; origin/woff2
  -- allowlist is enforced at save + resolve in src/lib/theme, where the
  -- platform storage origin is known)
  v_section := tokens -> 'typography';
  if v_section is not null then
    if jsonb_typeof(v_section) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_section) as k(key)
      where not (k.key = any (c_typo_keys))
    ) then
      return false;
    end if;
    for v_key, v_val in
      select e.k, e.v from jsonb_each(v_section) as e(k, v)
    loop
      if jsonb_typeof(v_val) <> 'string' then
        return false;
      end if;
      if (v_val #>> '{}') !~ '^https://' then
        return false;
      end if;
    end loop;
  end if;

  -- assets: relative bucket paths (charset [A-Za-z0-9/_.-], no '..') or
  -- https URLs (spec §4.2 "bucket paths or https URLs"). ':' is off-charset,
  -- so http:// or javascript: URIs in these fields are rejected.
  v_section := tokens -> 'assets';
  if v_section is not null then
    if jsonb_typeof(v_section) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_section) as k(key)
      where not (k.key = any (c_asset_keys))
    ) then
      return false;
    end if;
    for v_key, v_val in
      select e.k, e.v from jsonb_each(v_section) as e(k, v)
    loop
      if jsonb_typeof(v_val) <> 'string' then
        return false;
      end if;
      v_text := v_val #>> '{}';
      if v_text like 'https://%' then
        continue;
      end if;
      if v_text ~ '\.\.' or v_text !~ '^[A-Za-z0-9/_.-]+$' then
        return false;
      end if;
    end loop;
  end if;

  -- vocabulary: fixed 6-key whitelist, 64-char DB cap (spec §4.3 / Global
  -- Constraints; UI enforces 40 for UX)
  v_section := tokens -> 'vocabulary';
  if v_section is not null then
    if jsonb_typeof(v_section) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_section) as k(key)
      where not (k.key = any (c_vocab_keys))
    ) then
      return false;
    end if;
    for v_key, v_val in
      select e.k, e.v from jsonb_each(v_section) as e(k, v)
    loop
      if jsonb_typeof(v_val) <> 'string' then
        return false;
      end if;
      if char_length(v_val #>> '{}') > 64 then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

create table public.theme_presets (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  kind         text not null default 'system'
               check (kind in ('system', 'organizer')),
  organizer_id uuid references public.organizers (id) on delete cascade,
  tokens       jsonb not null
               constraint theme_presets_tokens_valid
               check (public.validate_theme_tokens(tokens, true)),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- NULL ⇔ system (spec §4.1): system presets are platform-owned (tenancy +
  -- anti-spoofing); organizer presets must point at their tenant
  constraint theme_presets_kind_organizer_match
    check (
      (kind = 'system' and organizer_id is null)
      or (kind = 'organizer' and organizer_id is not null)
    )
);

create index theme_presets_organizer_id_idx on public.theme_presets (organizer_id);

-- ── RLS ───────────────────────────────────────────────────────────────
-- System presets are public display config (readable by anon). Organizer
-- presets are tenant-scoped via JWT app_metadata.organizer_id — organizer A
-- cannot read or attach organizer B's custom preset (spec §12.4). The
-- insert/update WITH CHECK also blocks kind='system' spoofing (organizer_id
-- IS NULL can never equal get_my_organizer_id()). service_role bypasses RLS
-- for seeding (079) and the cert pipeline.

alter table public.theme_presets enable row level security;

create policy "theme presets system public read"
  on public.theme_presets for select
  to anon, authenticated
  using (kind = 'system');

create policy "theme presets organizer read own"
  on public.theme_presets for select
  to authenticated
  using (organizer_id = get_my_organizer_id());

create policy "theme presets organizer insert own"
  on public.theme_presets for insert
  to authenticated
  with check (kind = 'organizer' and organizer_id = get_my_organizer_id());

create policy "theme presets organizer update own"
  on public.theme_presets for update
  to authenticated
  using (kind = 'organizer' and organizer_id = get_my_organizer_id())
  with check (kind = 'organizer' and organizer_id = get_my_organizer_id());

create policy "theme presets organizer delete own"
  on public.theme_presets for delete
  to authenticated
  using (kind = 'organizer' and organizer_id = get_my_organizer_id());

create policy "theme presets admin manage"
  on public.theme_presets for all
  to authenticated
  using (is_admin())
  with check (is_admin());

grant select on public.theme_presets to anon, authenticated;
grant insert, update, delete on public.theme_presets to authenticated;

-- ══ down ══════════════════════════════════════════════════════════════
-- drop table public.theme_presets;  -- drops constraints, index, policies
-- drop function public.validate_theme_tokens(jsonb, boolean);
