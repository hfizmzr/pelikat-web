/**
 * Theme resolver — spec §5 flow: preset.tokens ⊕ event.theme_config → merge
 * (known-keys, plain-object guard, null→drop) → HEX validation → contrast
 * precheck → dark derivation → ResolvedTheme.
 *
 * Resolve NEVER throws (spec §5.5): any failure — missing preset, malformed
 * theme_config, unexpected errors — degrades to the platform theme with
 * recorded warnings. The stylesheet whitelist (Task 10) stays the hard
 * boundary; this module only decides token values.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  hexToOklch,
  oklchToString,
  contrastRatio,
  pickForeground,
  relativeLuminance,
  deriveDarkVariant,
  PLATFORM_BG_HEX,
} from './color'
import { LABEL_KEYS, resolveLabels } from './labels'
import { isPlainObject, themeFontUrlOk, assetValueOk } from './utils'
import type { BrandSlot, ResolvedTheme, ThemeTokens } from './types'

// Stored-token HEX contract (Global Constraints / spec §4.3: ^#[0-9a-fA-F]{6}$).
// color.ts's own regex is looser (`#` optional) and private; resolve validates
// the stored contract verbatim.
const HEX_RE = /^#[0-9a-fA-F]{6}$/

// Platform dark foreground — assigned DIRECTLY to fgDark for themed slots.
// Carried requirement (Task 6 review): never call pickForeground on an oklch
// string — parseHex is HEX-only, so it would "fail" and silently return this
// same dark fg, masking real bugs. Direct assignment keeps that failure
// impossible; dark variants (L ∈ [0.68, 0.82]) always measure ≥ ~6.9:1
// against it, so the companion is safe by construction.
const DARK_FG = 'oklch(0.145 0 0)'

const COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'foreground', 'ring'] as const
const TYPOGRAPHY_KEYS = ['heading_font_url', 'body_font_url'] as const
const ASSET_KEYS = ['banner_url', 'logo_url', 'badge_icon_url', 'certificate_background_url'] as const
const META_KEYS = ['version'] as const
const SECTION_KEYS = ['colors', 'typography', 'assets', 'vocabulary', 'meta'] as const

// Platform tokens — mirror src/app/globals.css (:root / .dark). Keep in sync.
const PLATFORM_SLOTS: Record<'primary' | 'secondary' | 'accent' | 'ring', BrandSlot> = {
  primary: {
    light: 'oklch(0.51 0.16 190)',
    dark: 'oklch(0.75 0.13 190)',
    fgLight: 'oklch(1 0 0)',
    fgDark: 'oklch(0.15 0.04 190)',
  },
  secondary: {
    light: 'oklch(0.92 0 0)',
    dark: 'oklch(0.16 0 0)',
    fgLight: 'oklch(0.145 0 0)',
    fgDark: 'oklch(0.985 0 0)',
  },
  accent: {
    light: 'oklch(0.92 0 0)',
    dark: 'oklch(0.28 0.03 190)',
    fgLight: 'oklch(0.145 0 0)',
    fgDark: 'oklch(0.985 0 0)',
  },
  ring: {
    light: 'oklch(0.51 0.16 190)',
    dark: 'oklch(0.75 0.13 190)',
    fgLight: 'oklch(1 0 0)',
    fgDark: 'oklch(0.15 0.04 190)',
  },
}

// Resolve-time label fallbacks + sanitization live in labels.ts (Task 8) —
// single source of label truth for resolve, runner pages, and the cert payload.

/** Allowlist projection: copies only known keys from a plain object. */
function knownSection(src: unknown, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!isPlainObject(src)) return out
  for (const k of keys) if (k in src) out[k] = src[k]
  return out
}

function subKeysFor(section: (typeof SECTION_KEYS)[number]): readonly string[] {
  switch (section) {
    case 'colors':
      return COLOR_KEYS
    case 'typography':
      return TYPOGRAPHY_KEYS
    case 'assets':
      return ASSET_KEYS
    case 'vocabulary':
      // labels.ts owns the key list (single source of label truth).
      return LABEL_KEYS
    case 'meta':
      return META_KEYS
  }
}

/**
 * Deep merge of preset tokens ⊕ event override — event wins on leaf
 * conflicts, unknown keys dropped silently, non-object sections dropped,
 * `null` leaves/sections dropped (→ platform default downstream, spec §4.3
 * `jsonb_strip_nulls` semantics). Never throws on malformed input.
 */
export function mergeThemeConfig(preset: ThemeTokens, override: ThemeTokens | null): ThemeTokens {
  // Allowlist both sides up front — unknown keys (and `__proto__`-style JSONB
  // hand-crafts) can never reach the output object.
  const base = knownSection(preset, SECTION_KEYS)
  const over = override === null ? {} : knownSection(override, SECTION_KEYS)
  const merged: Record<string, unknown> = {}
  for (const section of SECTION_KEYS) {
    // Section-level null in the override = reset-to-platform for the whole
    // section (spec §4.3 jsonb_strip_nulls semantics). Read-side leniency
    // only: 076's write validator rejects explicit JSON nulls (jsonb_typeof
    // 'null' is neither 'object' nor 'string' — verified against the live
    // 076 function), so such rows can only exist hand-crafted; merge degrades
    // them to platform instead of throwing.
    if (over[section] === null) continue
    const keys = subKeysFor(section)
    const out: Record<string, unknown> = knownSection(base[section], keys)
    const b = knownSection(over[section], keys)
    for (const k of keys) {
      if (!(k in b)) continue
      if (b[k] === null) delete out[k]
      else out[k] = b[k]
    }
    if (Object.keys(out).length > 0) merged[section] = out
  }
  return merged as ThemeTokens
}

/** Event-row subset consumed by getResolvedTheme (Task 11 extends the select).
 * `id` (when present — the scope always carries it) unlocks the §4.3 RPC
 * fallback below for preset rows the caller cannot select under RLS. */
export type EventThemeInput = {
  id?: string
  theme_preset_id?: string | null
  theme_config?: unknown
}

function brandSlot(hex: string): BrandSlot {
  return {
    light: oklchToString(hexToOklch(hex)),
    dark: deriveDarkVariant(hex),
    fgLight: pickForeground(hex),
    // See DARK_FG comment — direct assignment, never pickForeground(oklch).
    fgDark: DARK_FG,
    // P4 Task 4 additive — the themed fill took effect; non-CSS consumers
    // (e-cert payload) read this HEX (oklch slots are unreadable there).
    hex,
  }
}

/**
 * Ruling #10 (P2 Task 5) — light-mode `-foreground` companion ratio for a HEX
 * fill: the fill paired with its computed companion `pickForeground(fill)`.
 * A WHITE pick passes by construction (pickForeground returns white only when
 * it reaches ≥4.5:1). A dark pick (`oklch(0.145 0 0)`) is unparseable by
 * HEX-only contrastRatio (it would silently return 1), so measure the fill's
 * WCAG luminance against the dark-fg constant's EXACT luminance: a neutral
 * OKLab gray's linear channel — hence its relative luminance — is L³ = 0.145³.
 */
const WHITE_FG = '#ffffff' // color.ts's private WHITE constant (stable)
const DARK_FG_LUMINANCE = 0.145 ** 3

function companionRatio(fill: string): number {
  if (pickForeground(fill) === WHITE_FG) return contrastRatio(fill, WHITE_FG)
  const y = relativeLuminance(fill)
  const hi = Math.max(y, DARK_FG_LUMINANCE)
  const lo = Math.min(y, DARK_FG_LUMINANCE)
  return (hi + 0.05) / (lo + 0.05)
}

function platformTheme(warnings: string[]): ResolvedTheme {
  return {
    primary: PLATFORM_SLOTS.primary,
    secondary: PLATFORM_SLOTS.secondary,
    accent: PLATFORM_SLOTS.accent,
    ring: PLATFORM_SLOTS.ring,
    background: { light: null, dark: null },
    foreground: { light: null, dark: null },
    fonts: { heading: null, body: null },
    assets: { banner: null, logo: null, certificate_background: null },
    labels: resolveLabels(null),
    warnings,
    source: { presetId: null, overriddenKeys: [] },
  }
}

/**
 * Resolve the event theme. Load preset → merge → validate → derive.
 * Never throws: any failure degrades to the platform theme + warnings.
 */
export async function getResolvedTheme(
  supabase: SupabaseClient,
  eventRow: EventThemeInput,
): Promise<ResolvedTheme> {
  try {
    return (await resolveTheme(supabase, eventRow)).resolved
  } catch (err) {
    return platformTheme([`theme resolution failed unexpectedly: ${String(err)}`])
  }
}

/**
 * P4 Task 4 (e-cert payload) — the same never-degrade resolution as
 * getResolvedTheme, plus the RAW merged token projection (preset ⊕ config)
 * that the derived slots came from. Needed because ResolvedTheme carries
 * oklch brand slots — the cert payload wants the validated HEX colors and
 * the RAW stored `certificate_background_url` key name Django's contract
 * expects (the resolved .assets slot carries the same value raw, P4 Task 5).
 * Never throws; null only when resolution itself failed internally.
 */
export async function getResolvedThemeParts(
  supabase: SupabaseClient,
  eventRow: EventThemeInput,
): Promise<{ resolved: ResolvedTheme; tokens: ThemeTokens } | null> {
  try {
    return await resolveTheme(supabase, eventRow)
  } catch {
    return null
  }
}

/**
 * Pure derivation half of the resolver — preset tokens ⊕ override config →
 * ResolvedTheme, NO database access. Isomorphic: getResolvedTheme wraps it
 * with the preset load (below); the editor's live preview (Task 13) calls it
 * directly with client-side draft state. Never throws on malformed input —
 * garbage degrades to platform defaults with warnings (spec §5.5).
 */
export function deriveTheme(
  presetTokens: ThemeTokens,
  rawConfig: ThemeTokens | null,
  presetId: string | null,
): ResolvedTheme {
  const warnings: string[] = []
  const overridden: string[] = []

  // theme_config is hand-craftable JSONB — never trust its shape (Review
  // Focus #3). Merge runs on allowlisted projections only.
  let config: ThemeTokens | null = rawConfig
  if (rawConfig !== null && !isPlainObject(rawConfig)) {
    warnings.push('theme_config: not an object — ignored')
    config = null
  }

  const merged = mergeThemeConfig(presetTokens, config)
  const colors = merged.colors ?? {}

  // Surviving override leaves — source.overriddenKeys records keys the EVENT
  // set (post-merge, pre-validation); degraded keys still drop out because
  // marking only happens when a value actually takes effect below.
  const overrideLeaves = new Set<string>()
  if (config !== null) {
    const over = knownSection(config, SECTION_KEYS)
    for (const section of SECTION_KEYS) {
      if (over[section] === null) continue
      const b = knownSection(over[section], subKeysFor(section))
      for (const k of subKeysFor(section)) if (k in b && b[k] !== null) overrideLeaves.add(`${section}.${k}`)
    }
  }
  function markOverridden(path: string): void {
    if (overrideLeaves.has(path)) overridden.push(path)
  }

  function themedColor(role: 'primary' | 'secondary' | 'accent' | 'ring'): BrandSlot {
    const raw = colors[role]
    if (typeof raw !== 'string' || !HEX_RE.test(raw)) {
      // Absent (or null-dropped) → platform default silently; present but
      // malformed → platform default + warning.
      if (raw !== undefined) warnings.push(`colors.${role}: invalid HEX — using platform color`)
      return PLATFORM_SLOTS[role]
    }
    if (role === 'secondary' || role === 'accent') {
      // Ruling #10 (P2 Task 5): these slots are UI surfaces — they render when
      // their computed -foreground companions pass ≥4.5:1, replacing the P1
      // fill-vs-platform-background gate. Mode-companions:
      // - light: fg = pickForeground(fill) — measured by companionRatio above
      //   (WHITE pick ≥4.5:1 by construction, dark pick measured).
      // - dark: fill.dark is the deriveDarkVariant output — an opaque oklch
      //   with L clamped ∈ [0.68, 0.82] vs DARK_FG 'oklch(0.145 0 0)': at the
      //   L floor that is (0.68³+0.05)/(0.145³+0.05) ≈ 6.87:1 ≥ 4.5 — PASS by
      //   construction (P1-analyzed; no OKLab→sRGB solver to measure a
      //   chromatic oklch against HEX-only contrastRatio: passing is the
      //   contract). Light mode is therefore the only measured side.
      const ratio = companionRatio(raw)
      if (ratio < 4.5) {
        warnings.push(
          `colors.${role}: foreground companion ${ratio.toFixed(2)}:1 < 4.5:1 — using platform color`,
        )
        return PLATFORM_SLOTS[role]
      }
      markOverridden(`colors.${role}`)
      return brandSlot(raw)
    }
    // Contrast precheck (spec §5.5 semantics) — primary + ring keep the P1
    // fill-vs-platform-background gate unchanged (Ruling #10 regression
    // guard): primary <3:1 vs the platform background degrades to platform
    // (a bypassed #FFD700-class fill renders nothing readable); ring only
    // warns (P1 byte-identical).
    // PLATFORM_BG_HEX is color.ts's shared constant — the SAME decision the
    // validate.ts save-gate applies (Task 7 carried requirement). Dark
    // variants (L ∈ [0.68, 0.82]) trivially clear 3:1 against the dark
    // background (oklch(0.07 0 0)), so light-mode is the only side gated.
    const ratio = contrastRatio(raw, PLATFORM_BG_HEX)
    if (ratio < 3 && role !== 'ring') {
      warnings.push(`colors.${role}: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 — using platform color`)
      return PLATFORM_SLOTS[role]
    }
    if (ratio < 3) {
      warnings.push(`colors.ring: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 (recommended)`)
    }
    markOverridden(`colors.${role}`)
    return brandSlot(raw)
  }

  function tint(key: 'background' | 'foreground'): { light: string | null; dark: string | null } {
    const raw = colors[key]
    if (typeof raw !== 'string' || !HEX_RE.test(raw)) {
      if (raw !== undefined) warnings.push(`colors.${key}: invalid HEX — using platform ${key}`)
      return { light: null, dark: null }
    }
    markOverridden(`colors.${key}`)
    // Dark tint derivation doesn't exist in color.ts (its clamp targets light-
    // mode brand fills); dark stays platform until background theming ships.
    return { light: oklchToString(hexToOklch(raw)), dark: null }
  }

  function font(key: 'heading_font_url' | 'body_font_url'): string | null {
    const typography = merged.typography ?? {}
    const raw = typography[key]
    if (raw === undefined) return null
    // §5.4 resolve-time floor (P2 Task 3): a font URL not passing the full
    // allowlist (https, fonts.gstatic.com or the platform storage origin,
    // .woff2, no traversal) drops the slot to null → Geist fallback
    // downstream. Never throws — hostile pre-existing DB rows degrade with
    // a structured warning. Save-time re-checks the same predicate as a
    // hard error (validate.ts); here it only degrades.
    if (!themeFontUrlOk(raw)) {
      warnings.push(`typography.${key}: not an allowed font URL — using platform font`)
      return null
    }
    markOverridden(`typography.${key}`)
    return raw
  }

  // Assets slot (Task 10): the resolved banner/logo values ThemedImage
  // renders (Task 11 rider: CONSUMERS expand bucket-path values to URLs via
  // storageAssetUrl — resolve returns the stored 076-legal shape raw).
  // The 076 write rule (https or clean bucket path, ONE
  // implementation in utils.ts) re-checked here as a degrade floor — hostile
  // hand-crafted JSONB rows drop the slot to null → gradient fallback
  // downstream, never a throw (same never-throw contract as the font slots).
  function asset(key: 'banner_url' | 'logo_url' | 'certificate_background_url'): string | null {
    const raw = (merged.assets ?? {})[key]
    if (raw === undefined) return null
    if (!assetValueOk(raw)) {
      warnings.push(`assets.${key}: not a valid asset value — using no themed asset`)
      return null
    }
    markOverridden(`assets.${key}`)
    return raw
  }

  // Labels: sanitize + fallback via labels.ts (single source of truth).
  // raw values are safe even unsanitized — labels render as React text
  // children only — but resolve output is always clean plain strings.
  const vocab = (merged.vocabulary ?? null) as Record<string, string> | null
  const labels = resolveLabels(vocab)
  for (const key of LABEL_KEYS) {
    if (typeof vocab?.[key] === 'string') markOverridden(`vocabulary.${key}`)
  }

  return {
    primary: themedColor('primary'),
    secondary: themedColor('secondary'),
    accent: themedColor('accent'),
    ring: themedColor('ring'),
    background: tint('background'),
    foreground: tint('foreground'),
    fonts: { heading: font('heading_font_url'), body: font('body_font_url') },
    assets: { banner: asset('banner_url'), logo: asset('logo_url'), certificate_background: asset('certificate_background_url') },
    labels,
    warnings,
    source: { presetId, overriddenKeys: overridden },
  }
}

async function resolveTheme(
  supabase: SupabaseClient,
  eventRow: EventThemeInput,
): Promise<{ resolved: ResolvedTheme; tokens: ThemeTokens }> {
  const loadWarnings: string[] = []

  const presetId =
    typeof eventRow.theme_preset_id === 'string' && eventRow.theme_preset_id.length > 0
      ? eventRow.theme_preset_id
      : null
  let presetTokens: ThemeTokens = {}
  let loadedId: string | null = null
  if (presetId !== null) {
    try {
      const { data, error } = await supabase
        .from('theme_presets')
        .select('id, tokens')
        .eq('id', presetId)
        .maybeSingle()
      if (error || !isPlainObject(data)) {
        // Review carry (reviewer thread resolve.ts:326): organizer-kind preset
        // rows are invisible to runner/anon callers under preset RLS. The
        // 078 `get_event_theme` RPC is SECURITY DEFINER and granted to
        // anon/authenticated/service_role, and returns the ALREADY-merged
        // tokens (preset.tokens ⊕ events.theme_config) for the event — feed
        // that in as the preset base: the TS merge below still lets the
        // event's config win, so the result is identical either way. Fallback
        // only when the event id is known; degrade gracefully otherwise.
        // Direct-call arg names must match the SQL declaration (078: event_id
        // uuid) — PostgREST named-argument RPC matching is name-exact.
        const eventId = typeof eventRow.id === 'string' && eventRow.id.length > 0 ? eventRow.id : null
        if (eventId !== null && typeof supabase.rpc === 'function') {
          const { data: rpcData, error: rpcError } = await supabase
            .rpc('get_event_theme', { event_id: eventId })
          if (!rpcError && isPlainObject(rpcData)) {
            loadWarnings.push(
              `theme preset ${presetId} not selectable (RLS) — resolved via get_event_theme RPC`,
            )
            presetTokens = mergeThemeConfig(rpcData as ThemeTokens, null)
            loadedId = presetId
          } else {
            loadWarnings.push(`theme preset ${presetId} not found — using platform theme`)
          }
        } else {
          loadWarnings.push(`theme preset ${presetId} not found — using platform theme`)
        }
      } else {
        loadedId = typeof data.id === 'string' ? data.id : null
        // data is the DB row { id, tokens } — project the tokens blob through
        // the same known-keys guard (malformed preset tokens degrade, never throw).
        presetTokens = mergeThemeConfig(data.tokens as ThemeTokens, null)
      }
    } catch (err) {
      loadWarnings.push(`theme preset ${presetId} lookup failed (${String(err)}) — using platform theme`)
    }
  }

  // config shape-guards + warnings live inside deriveTheme; the theme_config
  // value is handed over raw (garbage → platform + warning, never a throw).
  const derived = deriveTheme(presetTokens, (eventRow.theme_config ?? null) as ThemeTokens | null, loadedId)
  const resolved = { ...derived, warnings: [...loadWarnings, ...derived.warnings] }
  // P4 Task 4 — raw merged projection for non-CSS consumers (e-cert): the
  // SAME merge deriveTheme ran; same mergeThemeConfig contract (unknown /
  // non-object sections contribute nothing), so garbage configs yield
  // preset-only tokens here exactly like the derivation saw.
  const tokens = mergeThemeConfig(
    presetTokens,
    isPlainObject(eventRow.theme_config) ? (eventRow.theme_config as ThemeTokens) : null,
  )
  return { resolved, tokens }
}
