-- ── SEED PRESET TYPOGRAPHY (Event Themes P2 — spec §5.4, plan Task 1) ──
-- Adds "typography": {"heading_font_url", "body_font_url"} to the 6 system
-- presets from 079. URLs are the REAL Google Fonts OFL .woff2 files (latin
-- subset, weight 400), resolved via the CSS2 API with a Chrome user-agent:
-- fonts.googleapis.com/css2?family=…&display=swap → gstatic latin .woff2.
-- Batik Heritage = Prata heading / Inter body (@manager-locked); roster:
--   wizard-academy  = Cinzel        / Source Sans 3
--   hidden-village  = Bebas Neue    / Roboto
--   galaxy-runner   = Orbitron      / Roboto
--   sunset-marathon = Poppins       / Roboto
--   pelikat-classic = Barlow        / Barlow
--   batik-heritage  = Prata         / Inter
-- Each candidate is strict-validated with validate_theme_tokens(candidate,
-- true) (called POSITIONALLY — p_strict is a reserved-word param, P1 ruling)
-- before the UPDATE; a failure aborts that preset, never a silent bad seed.
-- Up is idempotent: jsonb `||` merge is deterministic, re-run = same tokens.

-- ══ up ════════════════════════════════════════════════════════════════

-- 2. Wizard Academy — Cinzel / Source Sans 3
do $$
declare
  v_candidate jsonb;
begin
  select tokens || jsonb_build_object(
    'typography',
    jsonb_build_object(
      'heading_font_url',
      'https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnfY3lDQ.woff2',
      'body_font_url',
      'https://fonts.gstatic.com/s/sourcesans3/v20/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky462EK9Cs.woff2'
    )
  ) into v_candidate
  from public.theme_presets
  where id = 'e2c9ba7d-4751-4101-a2e8-b27c86c61a1b';  -- wizard-academy

  if v_candidate is null then
    raise exception '081_seed_preset_typography: wizard-academy row not found';
  end if;
  if not validate_theme_tokens(v_candidate, true) then
    raise exception '081_seed_preset_typography: candidate invalid for wizard-academy';
  end if;

  update public.theme_presets set tokens = v_candidate
  where id = 'e2c9ba7d-4751-4101-a2e8-b27c86c61a1b';
end
$$;

-- 3. Hidden Village — Bebas Neue / Roboto
do $$
declare
  v_candidate jsonb;
begin
  select tokens || jsonb_build_object(
    'typography',
    jsonb_build_object(
      'heading_font_url',
      'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9Wlhyw.woff2',
      'body_font_url',
      'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2'
    )
  ) into v_candidate
  from public.theme_presets
  where id = '04b5923b-d10d-49fe-ad74-7c5705f92179';  -- hidden-village

  if v_candidate is null then
    raise exception '081_seed_preset_typography: hidden-village row not found';
  end if;
  if not validate_theme_tokens(v_candidate, true) then
    raise exception '081_seed_preset_typography: candidate invalid for hidden-village';
  end if;

  update public.theme_presets set tokens = v_candidate
  where id = '04b5923b-d10d-49fe-ad74-7c5705f92179';
end
$$;

-- 4. Galaxy Runner — Orbitron / Roboto
do $$
declare
  v_candidate jsonb;
begin
  select tokens || jsonb_build_object(
    'typography',
    jsonb_build_object(
      'heading_font_url',
      'https://fonts.gstatic.com/s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1nyGy6BoWgz.woff2',
      'body_font_url',
      'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2'
    )
  ) into v_candidate
  from public.theme_presets
  where id = 'bd39de2a-0ff0-455e-bb27-047bca7b8194';  -- galaxy-runner

  if v_candidate is null then
    raise exception '081_seed_preset_typography: galaxy-runner row not found';
  end if;
  if not validate_theme_tokens(v_candidate, true) then
    raise exception '081_seed_preset_typography: candidate invalid for galaxy-runner';
  end if;

  update public.theme_presets set tokens = v_candidate
  where id = 'bd39de2a-0ff0-455e-bb27-047bca7b8194';
end
$$;

-- 5. Sunset Marathon — Poppins / Roboto
do $$
declare
  v_candidate jsonb;
begin
  select tokens || jsonb_build_object(
    'typography',
    jsonb_build_object(
      'heading_font_url',
      'https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrJJfecg.woff2',
      'body_font_url',
      'https://fonts.gstatic.com/s/roboto/v51/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbVmUiAo.woff2'
    )
  ) into v_candidate
  from public.theme_presets
  where id = 'e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca';  -- sunset-marathon

  if v_candidate is null then
    raise exception '081_seed_preset_typography: sunset-marathon row not found';
  end if;
  if not validate_theme_tokens(v_candidate, true) then
    raise exception '081_seed_preset_typography: candidate invalid for sunset-marathon';
  end if;

  update public.theme_presets set tokens = v_candidate
  where id = 'e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca';
end
$$;

-- 1. Pelikat Classic — Barlow / Barlow
do $$
declare
  v_candidate jsonb;
begin
  select tokens || jsonb_build_object(
    'typography',
    jsonb_build_object(
      'heading_font_url',
      'https://fonts.gstatic.com/s/barlow/v13/7cHpv4kjgoGqM7E_DMs5.woff2',
      'body_font_url',
      'https://fonts.gstatic.com/s/barlow/v13/7cHpv4kjgoGqM7E_DMs5.woff2'
    )
  ) into v_candidate
  from public.theme_presets
  where id = 'b7d4dfdd-0c4d-4427-b561-b989f370008d';  -- pelikat-classic

  if v_candidate is null then
    raise exception '081_seed_preset_typography: pelikat-classic row not found';
  end if;
  if not validate_theme_tokens(v_candidate, true) then
    raise exception '081_seed_preset_typography: candidate invalid for pelikat-classic';
  end if;

  update public.theme_presets set tokens = v_candidate
  where id = 'b7d4dfdd-0c4d-4427-b561-b989f370008d';
end
$$;

-- 6. Batik Heritage — Prata / Inter (@manager-locked)
do $$
declare
  v_candidate jsonb;
begin
  select tokens || jsonb_build_object(
    'typography',
    jsonb_build_object(
      'heading_font_url',
      'https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2',
      'body_font_url',
      'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2'
    )
  ) into v_candidate
  from public.theme_presets
  where id = '03c7d417-d02a-4104-9299-2f03be5c4d66';  -- batik-heritage

  if v_candidate is null then
    raise exception '081_seed_preset_typography: batik-heritage row not found';
  end if;
  if not validate_theme_tokens(v_candidate, true) then
    raise exception '081_seed_preset_typography: candidate invalid for batik-heritage';
  end if;

  update public.theme_presets set tokens = v_candidate
  where id = '03c7d417-d02a-4104-9299-2f03be5c4d66';
end
$$;

-- ══ down ══════════════════════════════════════════════════════════════
-- update public.theme_presets set tokens = tokens - 'typography'
-- where id = 'b7d4dfdd-0c4d-4427-b561-b989f370008d';  -- pelikat-classic
-- update public.theme_presets set tokens = tokens - 'typography'
-- where id = 'e2c9ba7d-4751-4101-a2e8-b27c86c61a1b';  -- wizard-academy
-- update public.theme_presets set tokens = tokens - 'typography'
-- where id = '04b5923b-d10d-49fe-ad74-7c5705f92179';  -- hidden-village
-- update public.theme_presets set tokens = tokens - 'typography'
-- where id = 'bd39de2a-0ff0-455e-bb27-047bca7b8194';  -- galaxy-runner
-- update public.theme_presets set tokens = tokens - 'typography'
-- where id = 'e4fb2e41-ad2c-4e1f-a8a9-cf334acd72ca';  -- sunset-marathon
-- update public.theme_presets set tokens = tokens - 'typography'
-- where id = '03c7d417-d02a-4104-9299-2f03be5c4d66';  -- batik-heritage
