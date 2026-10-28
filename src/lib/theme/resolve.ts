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
  deriveDarkVariant,
} from './color'
import { LABEL_KEYS, resolveLabels } from './labels'
import type { BrandSlot, ResolvedTheme, ThemeTokens } from './types'

// Stored-token HEX contract (Global Constraints / spec §4.3: ^#[0-9a-fA-F]{6}$).
// color.ts's own regex is looser (`#` optional) and private; resolve validates
// the stored contract verbatim.
const HEX_RE = /^#[0-9a-fA-F]{6}$/

// Platform light --background from globals.css is oklch(0.985 0 0) ≈ #f4f4f4
// (luminance delta <0.1%); WCAG math in color.ts is HEX-only, so the precheck
// measures against this HEX proxy. Dark variants (L ∈ [0.68, 0.82]) trivially
// clear 3:1 against the dark background (oklch(0.07 0 0)), so light-mode is
// the only side that needs the gate.
const PLATFORM_BG_HEX = '#f4f4f4'

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

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
    // section (spec §4.3 jsonb_strip_nulls semantics; DB allows {"colors": null}).
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

/** Event-row subset consumed by getResolvedTheme (Task 11 extends the select). */
export type EventThemeInput = {
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
  }
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
    return await resolveTheme(supabase, eventRow)
  } catch (err) {
    return platformTheme([`theme resolution failed unexpectedly: ${String(err)}`])
  }
}

async function resolveTheme(supabase: SupabaseClient, eventRow: EventThemeInput): Promise<ResolvedTheme> {
  const warnings: string[] = []
  const overridden: string[] = []

  // theme_config is hand-craftable JSONB — never trust its shape (Review
  // Focus #3). Merge runs on allowlisted projections only.
  if (eventRow.theme_config != null && !isPlainObject(eventRow.theme_config)) {
    warnings.push('theme_config: not an object — ignored')
  }
  const config = isPlainObject(eventRow.theme_config) ? (eventRow.theme_config as ThemeTokens) : null

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
        warnings.push(`theme preset ${presetId} not found — using platform theme`)
      } else {
        loadedId = typeof data.id === 'string' ? data.id : null
        // data is the DB row { id, tokens } — project the tokens blob through
        // the same known-keys guard (malformed preset tokens degrade, never throw).
        presetTokens = mergeThemeConfig(data.tokens as ThemeTokens, null)
      }
    } catch (err) {
      warnings.push(`theme preset ${presetId} lookup failed (${String(err)}) — using platform theme`)
    }
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
    // Contrast precheck (spec §5.5 semantics): primary/secondary/accent
    // <3:1 vs the platform background degrade to platform (a bypassed
    // #FFD700-class fill renders nothing readable); ring only warns.
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
    // Spec §5.4 allowlist is enforced in full at save (validate.ts); resolve
    // applies the https-only floor. Origin + .woff2 narrowing at the
    // buildFontFace consumer (Task 10).
    if (typeof raw !== 'string' || !raw.startsWith('https://')) {
      warnings.push(`typography.${key}: must be an https URL — using platform font`)
      return null
    }
    markOverridden(`typography.${key}`)
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
    labels,
    warnings,
    source: { presetId: loadedId, overriddenKeys: overridden },
  }
}
