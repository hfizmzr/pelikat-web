/**
 * Vendored color math for Event Themes — zero-dependency (spec §5.2, design doc v2.1).
 *
 * Implements the standard sRGB → linear → OKLab → OKLCH formulas (Björn Ottosson,
 * public domain — same constants as culori / CSS Color 4) and WCAG 2.1 sRGB
 * relative luminance / contrast. No npm deps, no inverse OKLCH→sRGB (unneeded:
 * dark variants are emitted directly as `oklch()` strings).
 *
 * Every function degrades to a safe fallback on malformed input and never throws
 * (spec §5.5.4 "resolve never throws") — warnings are the caller's (resolve.ts) job.
 */

type Oklch = { l: number; c: number; h: number }

/** Strict token contract: `^#[0-9a-fA-F]{6}$` (Global Constraints); `#` optional at runtime. */
const HEX_RE = /^#?([0-9a-fA-F]{6})$/

/** `#rrggbb` → [r, g, b] 0–255 (cert payload). Malformed input → [0, 0, 0]. */
export function hexToRgb255(hex: string): [number, number, number] {
  return parseHex(hex) ?? [0, 0, 0]
}

/** `#rrggbb` → [r, g, b] 0–255, or null when malformed. */
function parseHex(hex: unknown): [number, number, number] | null {
  if (typeof hex !== 'string') return null
  const m = HEX_RE.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/**
 * sRGB transfer function. Two thresholds by spec:
 * - 0.04045 (standard sRGB/CSS) for the OKLCH path — parity with standard formulas.
 * - 0.03928 (WCAG 2.1 text) for relative luminance.
 * Difference is numerically negligible but we honor each spec verbatim.
 */
function toLinear(v: number, threshold: number): number {
  return v <= threshold ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearFromHex(hex: unknown, threshold: number): [number, number, number] | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  return [
    toLinear(rgb[0] / 255, threshold),
    toLinear(rgb[1] / 255, threshold),
    toLinear(rgb[2] / 255, threshold),
  ]
}

/** HEX → OKLCH. Malformed input → `{ l: 0, c: 0, h: 0 }` (black). */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const lin = linearFromHex(hex, 0.04045)
  if (!lin) return { l: 0, c: 0, h: 0 }
  const [r, g, b] = lin

  // linear sRGB → LMS (OKLab M1)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  // LMS' → OKLab (M2)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const c = Math.sqrt(a * a + b2 * b2)
  let h = (Math.atan2(b2, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

/** `{l, c, h}` → `oklch(L C H)` (l/c 3 decimals, h 1 decimal, trailing zeros trimmed). */
export function oklchToString(o: Oklch): string {
  return `oklch(${round(o.l, 3)} ${round(o.c, 3)} ${round(o.h, 1)})`
}

function round(v: number, digits: number): number {
  return Number(v.toFixed(digits))
}

/** WCAG 2.1 sRGB relative luminance (threshold 0.03928). Malformed input → 0. */
export function relativeLuminance(hex: string): number {
  const lin = linearFromHex(hex, 0.03928)
  if (!lin) return 0
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** WCAG 2.1 contrast ratio, order-independent. Malformed input → 1 (no contrast). */
export function contrastRatio(a: string, b: string): number {
  if (!parseHex(a) || !parseHex(b)) return 1
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// ── Platform background — ONE shared decision for both 3:1 gates ─────────
// The platform light --background is oklch(0.985 0 0) (globals.css :root), a
// neutral gray whose sRGB hex is exactly #fafafa (Y = 0.985³ → 250/255). WCAG
// math here is HEX-only, so the save-gate (validate.ts) and the resolve
// degrade-precheck both measure against this single constant. (The earlier
// resolve-side proxy #f4f4f4 drifted by ΔY = 0.051 and flipped verdicts in the
// 3.0–3.06:1 band — e.g. #909090 blocked at save, kept at render. Do not
// reintroduce a second constant; globals.css is the source of truth.)
export const PLATFORM_BG_HEX = '#fafafa'

const WHITE = '#ffffff'
const DARK_FOREGROUND = 'oklch(0.145 0 0)'

/**
 * First foreground reaching ≥4.5:1 against `fill`: `#ffffff`, else the platform
 * dark foreground `oklch(0.145 0 0)`. Guarantees a co-injected `-foreground`
 * companion (no white-on-yellow). Malformed fill → dark foreground.
 */
export function pickForeground(fill: string): string {
  if (parseHex(fill) && contrastRatio(fill, WHITE) >= 4.5) return WHITE
  return DARK_FOREGROUND
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
const DARK_FOREGROUND_LUMINANCE = 0.145 ** 3

export function companionRatio(fill: string): number {
  if (pickForeground(fill) === WHITE) return contrastRatio(fill, WHITE)
  const y = relativeLuminance(fill)
  const hi = Math.max(y, DARK_FOREGROUND_LUMINANCE)
  const lo = Math.min(y, DARK_FOREGROUND_LUMINANCE)
  return (hi + 0.05) / (lo + 0.05)
}

// Platform dark heuristic (spec §5.2 / globals.css light→dark): same hue,
// L clamped to [0.68, 0.82], chroma ×0.85 capped at 0.20.
const DARK_L_MIN = 0.68
const DARK_L_MAX = 0.82
const DARK_CHROMA_FACTOR = 0.85
const DARK_CHROMA_CAP = 0.2

/**
 * HEX → dark-variant `oklch()` string (same hue, L clamp [0.68, 0.82],
 * chroma ×0.85 cap 0.20). Malformed input → neutral `oklch(0.68 0 0)`.
 */
export function deriveDarkVariant(hex: string): string {
  const o = hexToOklch(hex)
  if (!parseHex(hex)) return oklchToString({ l: DARK_L_MIN, c: 0, h: 0 })
  const l = Math.min(Math.max(o.l, DARK_L_MIN), DARK_L_MAX)
  const c = Math.min(o.c * DARK_CHROMA_FACTOR, DARK_CHROMA_CAP)
  return oklchToString({ l, c, h: o.h })
}
