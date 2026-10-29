/**
 * Theme config validation — spec §5.5.1 (save-time WCAG gate) + client-side
 * mirror of the 076 DB validator `validate_theme_tokens(tokens, false)`
 * (non-strict mode — matches the `events.theme_config` CHECK in 077:
 * `theme_config is null or validate_theme_tokens(theme_config, false)`).
 *
 * Division of labor:
 * - `errors` → the DB would reject the write (`ok: false`); the editor
 *   hard-blocks and the saveEventTheme action (Task 13) re-checks server-side.
 * - `warnings` → WCAG warn-and-degrade (§5.5, §13 ④): the write is accepted;
 *   resolve.ts degrades at render. The ONLY hard block is `primary` <3:1 vs
 *   the platform background.
 *
 * Never throws (spec §5.5.4): unserializable/malformed input surfaces as
 * structured errors.
 */
import { contrastRatio, hexToOklch, pickForeground, relativeLuminance, PLATFORM_BG_HEX } from './color'
import { LABEL_KEYS } from './labels'
import { isPlainObject, themeFontUrlOk, assetValueOk } from './utils'

// Stored-token HEX contract (Global Constraints / spec §4.3: ^#[0-9a-fA-F]{6}$).
// Same strict regex resolve.ts validates; color.ts's runtime regex is looser
// (`#` optional) and private.
const HEX_RE = /^#[0-9a-fA-F]{6}$/

// 64 KB JSON cap (spec §4.3). The DB measures octet_length(jsonb::text) —
// a few % apart from JSON.stringify's bytes at the exact boundary; the DB
// stays authoritative on write, this is the UX pre-gate.
const MAX_JSON_BYTES = 65536

// §5.5.1 tint windows for the optional colors.background slot (oklch L):
// light [0.93, 0.995] / dark [0.05, 0.12] — else warn + ignore.
const TINT_L_LIGHT: [number, number] = [0.93, 0.995]
const TINT_L_DARK: [number, number] = [0.05, 0.12]

export type ThemeValidation = { ok: boolean; errors: string[]; warnings: string[] }

const TOP_KEYS = ['colors', 'typography', 'assets', 'vocabulary', 'meta']
const COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'foreground', 'ring']
const TYPOGRAPHY_KEYS = ['heading_font_url', 'body_font_url']
const ASSET_KEYS = ['banner_url', 'logo_url', 'badge_icon_url', 'certificate_background_url']

/** Serialized byte length, or null when unserializable (cyclic and friends). */
function jsonBytes(config: unknown): number | null {
  try {
    const json = JSON.stringify(config)
    if (json === undefined) return null
    return new TextEncoder().encode(json).length
  } catch {
    return null
  }
}

/**
 * Ruling #10 (P2 Task 5) — light-mode `-foreground` companion ratio. MIRRORS
 * resolve.ts's companionRatio (same shape as the mirrored PLATFORM_BG_HEX
 * decision): fill paired with its computed companion `pickForeground(fill)`.
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

/** §5.5 WCAG gate — primary keeps the SAME platform-background decision as
 * resolve.ts's precheck (color.ts PLATFORM_BG_HEX). Light-mode only: dark
 * variants (L ∈ [0.68, 0.82]) trivially clear 3:1 against the dark background.
 * secondary/accent (Ruling #10, P2 Task 5) mirror save-side the resolve
 * -foreground companion gate as a WARNING — never blocks (the hard block
 * stays primary-only); resolve.ts degrades at render when the companion
 * fails. */
function contrastGate(hexes: Record<string, string>, errors: string[], warnings: string[]): void {
  const primary = hexes.primary
  if (primary !== undefined) {
    const ratio = contrastRatio(primary, PLATFORM_BG_HEX)
    if (ratio < 3) {
      // The only hard block (spec §5.5, locked §13 ④).
      errors.push(`colors.primary: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 — save blocked`)
    }
  }
  for (const role of ['secondary', 'accent'] as const) {
    const hex = hexes[role]
    if (hex === undefined) continue
    // Ruling #10 (P2 Task 5): warn-and-accept mirror of the resolve
    // -foreground companion criterion (≥4.5:1) — never blocks (§5.5 hard
    // block stays primary-only).
    const ratio = companionRatio(hex)
    if (ratio < 4.5) {
      warnings.push(
        `colors.${role}: foreground companion ${ratio.toFixed(2)}:1 < 4.5:1 — will degrade at render (companion contrast < 4.5:1)`,
      )
    }
  }
  const ring = hexes.ring
  if (ring !== undefined) {
    const ratio = contrastRatio(ring, PLATFORM_BG_HEX)
    if (ratio < 3) {
      warnings.push(`colors.ring: contrast ${ratio.toFixed(2)}:1 vs platform background < 3:1 (recommended)`)
    }
  }
}

/** §5.5.1: the optional background slot is accepted only as a tint — oklch
 * L ∈ [0.93, 0.995] light / [0.05, 0.12] dark — else warn + ignore. */
function tintGate(hexes: Record<string, string>, warnings: string[]): void {
  const background = hexes.background
  if (background === undefined) return
  const l = hexToOklch(background).l
  const inTint =
    (l >= TINT_L_LIGHT[0] && l <= TINT_L_LIGHT[1]) || (l >= TINT_L_DARK[0] && l <= TINT_L_DARK[1])
  if (!inTint) {
    warnings.push(
      `colors.background: oklch L ${l.toFixed(3)} outside tint windows [0.93, 0.995] light / [0.05, 0.12] dark — will be ignored`,
    )
  }
}

/**
 * Validate an `events.theme_config`-shaped payload. Collects ALL problems
 * (never first-fail) so the editor can show everything at once. Accepts
 * partial configs; `null`/`undefined` = "no config" (valid per the 077
 * CHECK's own `theme_config is null or …` clause).
 */
export function validateThemeConfig(config: unknown): ThemeValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (config === null || config === undefined) {
    return { ok: true, errors, warnings }
  }

  if (!isPlainObject(config)) {
    errors.push('theme_config: must be a JSON object')
    return { ok: false, errors, warnings }
  }

  const bytes = jsonBytes(config)
  if (bytes === null) {
    errors.push('theme_config: not serializable as JSON')
    return { ok: false, errors, warnings }
  }
  if (bytes > MAX_JSON_BYTES) {
    errors.push(`theme_config: ${(bytes / 1024).toFixed(1)} KB exceeds the 64 KB JSON cap`)
    return { ok: false, errors, warnings }
  }

  for (const key of Object.keys(config)) {
    if (!TOP_KEYS.includes(key)) errors.push(`theme_config.${key}: unknown key — rejected`)
  }

  // meta: {"version": 1} exactly when present (DB: only 'version' allowed,
  // value must equal the JSON number 1 — string "1" rejected).
  const meta = config.meta
  if (meta !== undefined) {
    if (!isPlainObject(meta)) {
      errors.push('meta: must be an object {"version": 1}')
    } else {
      for (const key of Object.keys(meta)) {
        if (key !== 'version') errors.push(`meta.${key}: unknown key — only "version" is allowed`)
      }
      const v = meta.version
      if (typeof v !== 'number' || !Number.isInteger(v) || v !== 1) {
        errors.push('meta.version: must be the JSON number 1')
      }
    }
  }

  // colors: known keys + HEX contract, then the §5.5 WCAG gate.
  const colors = config.colors
  if (colors !== undefined) {
    if (!isPlainObject(colors)) {
      errors.push('colors: must be an object of HEX strings')
    } else {
      for (const key of Object.keys(colors)) {
        if (!COLOR_KEYS.includes(key)) errors.push(`colors.${key}: unknown key — rejected`)
      }
      const hexes: Record<string, string> = {}
      for (const key of COLOR_KEYS) {
        const raw = colors[key]
        if (raw === undefined) continue
        // JSON null at leaf level fails the DB's jsonb_typeof check ('null' is
        // not a string) — mirror it (076 rejects ALL explicit JSON nulls).
        if (typeof raw !== 'string' || !HEX_RE.test(raw)) {
          errors.push(`colors.${key}: must be a HEX string matching ^#[0-9a-fA-F]{6}$`)
          continue
        }
        hexes[key] = raw
      }
      contrastGate(hexes, errors, warnings)
      tintGate(hexes, warnings)
    }
  }

  // typography: known keys + §5.4 font-URL allowlist (enforced at save —
  // P2 Task 3); resolve.ts re-checks with the same themeFontUrlOk below its
  // drop-and-degrade floor.
  const typography = config.typography
  if (typography !== undefined) {
    if (!isPlainObject(typography)) {
      errors.push('typography: must be an object of https URLs')
    } else {
      for (const key of Object.keys(typography)) {
        if (!TYPOGRAPHY_KEYS.includes(key)) errors.push(`typography.${key}: unknown key — rejected`)
      }
      for (const key of TYPOGRAPHY_KEYS) {
        const raw = typography[key]
        if (raw === undefined) continue
        // §5.4 enforced at save AND resolve: a non-allowlisted font URL is a
        // hard error (the write would render untrusted CSS — allowlist via
        // themeFontUrlOk, the ONE implementation in utils.ts). Note this is
        // strictly stronger than the DB floor (DB: https only) — a config the
        // DB accepts here stays editor-blocked per spec.
        if (!themeFontUrlOk(raw)) {
          errors.push(
            `typography.${key}: not an allowed font URL — must be https://fonts.gstatic.com or the platform storage origin, end in .woff2, and contain no path traversal`,
          )
        }
      }
    }
  }

  // assets: bucket paths or https URLs (076 charset/traversal rules).
  const assets = config.assets
  if (assets !== undefined) {
    if (!isPlainObject(assets)) {
      errors.push('assets: must be an object of bucket paths or https URLs')
    } else {
      for (const key of Object.keys(assets)) {
        if (!ASSET_KEYS.includes(key)) errors.push(`assets.${key}: unknown key — rejected`)
      }
      for (const key of ASSET_KEYS) {
        const raw = assets[key]
        if (raw === undefined) continue
        if (typeof raw !== 'string' || !assetValueOk(raw)) {
          errors.push(
            `assets.${key}: must be a bucket path ([A-Za-z0-9/_.-], no '..') or an https:// URL`,
          )
        }
      }
    }
  }

  // vocabulary: fixed 6-key whitelist (labels.ts owns the list), 64-char DB
  // cap (the UI enforces 40 for UX; DB is authoritative).
  const vocabulary = config.vocabulary
  if (vocabulary !== undefined) {
    if (!isPlainObject(vocabulary)) {
      errors.push('vocabulary: must be an object of label strings')
    } else {
      const allowed = LABEL_KEYS as readonly string[]
      for (const key of Object.keys(vocabulary)) {
        if (!allowed.includes(key)) errors.push(`vocabulary.${key}: unknown key — rejected`)
      }
      for (const key of LABEL_KEYS) {
        const raw = vocabulary[key]
        if (raw === undefined) continue
        if (typeof raw !== 'string' || raw.length > 64) {
          errors.push(`vocabulary.${key}: must be a string of at most 64 characters`)
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
