-- ── SEED 6 SYSTEM THEME PRESETS (Event Themes P1 — spec §4.6, §13 sign-off ③) ──
-- Roster with FIXED uuids, committed as literals (events.theme_preset_id FK from
-- 077 targets these — NEVER regenerate): Pelikat Classic, Wizard Academy,
-- Hidden Village, Galaxy Runner, Sunset Marathon, Batik Heritage.
-- Every row: kind='system' + organizer_id IS NULL (076 NULL⇔system constraint);
-- tokens pass the strict theme_presets_tokens CHECK (validate_theme_tokens
-- (tokens, true) — colors.primary/secondary/accent HEX required, meta {"version": 1}).
-- Colors: Batik Heritage verbatim from §4.6. The other five finalize §4.6's
-- indicative roles at seed time (§4.6 header: "final at seed time"); primaries
-- ≥3:1 vs platform background per the §5.5 gate philosophy; Pelikat Classic
-- reuses the platform brand primary oklch(0.51 0.16 190) → #00807A. Roster names
-- are generic archetypes (§4.6/§10.1: no franchise themes shipped).
-- typography/assets sections intentionally OMITTED: the §4.2 contract has no
-- font-family key (heading_font_url/body_font_url are https URLs only) and
-- asset paths/fonts are P2 scope (plan Roadmap); §4.6 family names (e.g. Batik
-- "Prata"/"Inter") are indicative prose with no v1 token representation —
-- revisit at the P2 gate.
-- Up: one explicit row per preset; on conflict (slug) do nothing keeps the seed
-- idempotent. Down: delete the six rows by their fixed uuids (077's
-- ON DELETE SET NULL on events.theme_preset_id keeps referencing events intact).

-- ══ up ════════════════════════════════════════════════════════════════

insert into public.theme_presets (id, slug, name, description, kind, organizer_id, tokens)
values
  -- 1. Pelikat Classic — platform look: brand teal + race-day red (§4.6.1)
  (
    'b7d4dfdd-0c4d-4427-b561-b989f370008d',
    'pelikat-classic',
    'Pelikat Classic',
    'Pelikat platform look — brand teal with race-day red accents.',
    'system',
    null,
    '{
      "colors": {
        "primary": "#00807A",
        "secondary": "#115E59",
        "accent": "#C62A2F",
        "ring": "#00807A"
      },
      "meta": {"version": 1}
    }'::jsonb
  ),

  -- 2. Wizard Academy — midnight purple + antique gold (§4.6.2)
  (
    'e2c9ba7d-4751-4101-a2e8-b27c86c61a1b',
    'wizard-academy',
    'Wizard Academy',
    'Midnight purple and antique gold — a school-of-magic run day.',
    'system',
    null,
    '{
      "colors": {
        "primary": "#4C1D95",
        "secondary": "#5B21B6",
        "accent": "#A16207",
        "ring": "#4C1D95"
      },
      "vocabulary": {
        "bib_label": "Spell Number",
        "medal_label": "House Crest",
        "certificate_label": "Diploma of Magic"
      },
      "meta": {"version": 1}
    }'::jsonb
  ),

  -- 3. Hidden Village — forest greens + moss (§4.6.3)
  (
    '04b5923b-d10d-49fe-ad74-7c5705f92179',
    'hidden-village',
    'Hidden Village',
    'Forest greens and moss — a hidden woodland village trail.',
    'system',
    null,
    '{
      "colors": {
        "primary": "#166534",
        "secondary": "#365314",
        "accent": "#4D7C0F",
        "ring": "#166534"
      },
      "vocabulary": {
        "checkpoint_label": "Waypoint",
        "run_label": "Trail"
      },
      "meta": {"version": 1}
    }'::jsonb
  ),

  -- 4. Galaxy Runner — deep-space navy + neon cyan (§4.6.4)
  (
    'bd39de2a-0ff0-455e-bb27-047bca7b8194',
    'galaxy-runner',
    'Galaxy Runner',
    'Deep-space navy with neon cyan — an interstellar run.',
    'system',
    null,
    '{
      "colors": {
        "primary": "#1E1B4B",
        "secondary": "#312E81",
        "accent": "#0891B2",
        "ring": "#1E1B4B"
      },
      "vocabulary": {
        "bib_label": "Crew ID",
        "medal_label": "Star Shard"
      },
      "meta": {"version": 1}
    }'::jsonb
  ),

  -- 5. Sunset Marathon — dusk orange → pink (§4.6.5)
  (
    'e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca',
    'sunset-marathon',
    'Sunset Marathon',
    'Dusk orange fading to pink — a sunset finish line.',
    'system',
    null,
    '{
      "colors": {
        "primary": "#C2410C",
        "secondary": "#9A3412",
        "accent": "#BE185D",
        "ring": "#C2410C"
      },
      "meta": {"version": 1}
    }'::jsonb
  ),

  -- 6. Batik Heritage — Malaysian batik-inspired; tokens verbatim §4.6 (§13 ③)
  (
    '03c7d417-d02a-4104-9299-2f03be5c4d66',
    'batik-heritage',
    'Batik Heritage',
    'Malaysian batik-inspired — terracotta and canting gold on wax-cream.',
    'system',
    null,
    '{
      "colors": {
        "primary": "#9C4A1A",
        "secondary": "#3E2C23",
        "accent": "#D4A017",
        "background": "#FBF6EC",
        "foreground": "#2B2118",
        "ring": "#C68B2E"
      },
      "vocabulary": {
        "checkpoint_label": "Kampung",
        "medal_label": "Pingat",
        "run_label": "Larian",
        "participant_label": "Peserta",
        "certificate_label": "Sijil"
      },
      "meta": {"version": 1}
    }'::jsonb
  )
on conflict (slug) do nothing;

-- ══ down ══════════════════════════════════════════════════════════════
-- delete from public.theme_presets
-- where id in (
--   'b7d4dfdd-0c4d-4427-b561-b989f370008d',  -- pelikat-classic
--   'e2c9ba7d-4751-4101-a2e8-b27c86c61a1b',  -- wizard-academy
--   '04b5923b-d10d-49fe-ad74-7c5705f92179',  -- hidden-village
--   'bd39de2a-0ff0-455e-bb27-047bca7b8194',  -- galaxy-runner
--   'e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca',  -- sunset-marathon
--   '03c7d417-d02a-4104-9299-2f03be5c4d66'   -- batik-heritage
-- );
