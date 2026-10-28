/**
 * Theme-editor draft state (Task 13, spec §8). Isomorphic pure helpers over
 * the `events.theme_config`-shaped override draft.
 *
 * Reset semantics (carried requirements, Tasks 3/9):
 *  - per-key reset = OMIT the key — explicit JSON nulls are rejected at every
 *    nesting level (validate.ts mirror + 076 validator), so the editor never
 *    produces them;
 *  - a draft with nothing left normalizes to null = full reset (the action
 *    writes `theme_config: null`, SQL NULL).
 */
import { LABEL_KEYS } from './labels'
import type { ThemeTokens } from './types'

const SECTION_KEYS = ['colors', 'typography', 'assets', 'vocabulary'] as const

// Canonical key order for the sections the P1 editor edits (colors +
// vocabulary). jsonb row order is not stable; rebuilding in this order keeps
// equality checks stable. Same list as validate.ts/resolve.ts (kept local,
// mirroring the codebase's per-module self-containment).
const COLOR_KEYS = ['primary', 'secondary', 'accent', 'background', 'foreground', 'ring'] as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * DB row (untrusted JSONB shape) → a safe editable draft. Non-object sections
 * (including explicit section nulls) are omitted — they are reset-to-platform
 * per merge semantics, and carrying them would trip the write validator.
 */
export function seedThemeDraft(config: unknown): ThemeTokens {
  if (!isPlainObject(config)) return {}
  const out: Record<string, unknown> = {}

  const colors = config.colors
  if (isPlainObject(colors)) {
    const c: Record<string, unknown> = {}
    for (const k of COLOR_KEYS) if (k in colors) c[k] = colors[k]
    if (Object.keys(c).length > 0) out.colors = c
  }

  const vocabulary = config.vocabulary
  if (isPlainObject(vocabulary)) {
    const v: Record<string, unknown> = {}
    for (const k of LABEL_KEYS) if (k in vocabulary) v[k] = vocabulary[k]
    if (Object.keys(v).length > 0) out.vocabulary = v
  }

  // Sections the P1 editor doesn't manage (P2 assets/typography) pass through
  // verbatim so a later phase's data survives an earlier-phase edit.
  for (const section of ['typography', 'assets'] as const) {
    const value = config[section]
    if (isPlainObject(value) && Object.keys(value).length > 0) out[section] = { ...value }
  }

  return out as ThemeTokens
}

/**
 * Draft → the exact payload to persist: null leaves/sections omitted, empty
 * sections dropped, empty draft → null (full reset). Never emits JSON nulls.
 */
export function normalizeThemeDraft(draft: ThemeTokens | null): ThemeTokens | null {
  if (draft === null || !isPlainObject(draft)) return null
  const out: Record<string, unknown> = {}
  for (const section of SECTION_KEYS) {
    const value = draft[section]
    if (!isPlainObject(value)) continue
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (v !== null) clean[k] = v
    if (Object.keys(clean).length > 0) out[section] = clean
  }
  return Object.keys(out).length > 0 ? (out as ThemeTokens) : null
}

/** Stable, key-order-independent comparison of two drafts (normalized). */
export function themeDraftEquals(a: ThemeTokens | null, b: ThemeTokens | null): boolean {
  return stableStringify(normalizeThemeDraft(a)) === stableStringify(normalizeThemeDraft(b))
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}
