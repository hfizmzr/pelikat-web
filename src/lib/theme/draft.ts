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
import { isPlainObject } from './utils'
import type { ThemeTokens } from './types'
import { COLOR_KEYS, ASSET_KEYS, TYPOGRAPHY_KEYS } from './types'

// Sections the P1 editor edits (colors + vocabulary) — `meta` is not part of
// the draft (validate.ts/076 shape it exactly).
const SECTION_KEYS = ['colors', 'typography', 'assets', 'vocabulary'] as const

// Canonical key order for the sections the P1 editor edits (colors +
// vocabulary). jsonb row order is not stable; rebuilding in this order keeps
// equality checks stable. Sub-key lists come from types.ts (the ONE const
// source shared with validate.ts/resolve.ts).

const STRING_KEYS: Record<'assets' | 'typography', readonly string[]> = {
  assets: ASSET_KEYS,
  typography: TYPOGRAPHY_KEYS,
}

/** Keep only known string leaves of an assets/typography section. */
function projectStringSection(section: 'assets' | 'typography', value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null
  const keys = STRING_KEYS[section]
  const picked: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in value && typeof value[key] === 'string') picked[key] = value[key]
  }
  return Object.keys(picked).length > 0 ? picked : null
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

  // Sections the P2 editor edits (assets/typography): allowlist projection —
  // string values on known keys only (unknown keys rejected, nulls omitted).
  for (const section of ['typography', 'assets'] as const) {
    const picked = projectStringSection(section, config[section])
    if (picked) out[section] = picked
  }

  return out as ThemeTokens
}

/**
 * Draft → the exact payload to persist: null leaves/sections omitted, empty
 * sections dropped, empty draft → null (full reset). Never emits JSON nulls.
 *
 * Review carry (FIX 2): the draft store holds untrimmed keystroke state
 * (sanitizeDraftLabel keeps tail spaces mid-typing) — vocabulary strings are
 * TRIMMED here so the DB keeps trimmed canonical values. NOT a full
 * sanitizeLabel re-run: seeded values the organizer did not edit (stored
 * labels up to the DB's 64-char cap) must land in the write payload
 * unchanged — trimming alone can never change a non-whitespace label.
 */
export function normalizeThemeDraft(draft: ThemeTokens | null): ThemeTokens | null {
  if (draft === null || !isPlainObject(draft)) return null
  const out: Record<string, unknown> = {}
  for (const section of SECTION_KEYS) {
    const value = draft[section]
    if (!isPlainObject(value)) continue
    // assets/typography: allowlist-projected string sections (P2 Task 7).
    if (section === 'assets' || section === 'typography') {
      const picked = projectStringSection(section, value)
      if (picked) out[section] = picked
      continue
    }
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === null) continue
      if (section === 'vocabulary' && typeof v === 'string') {
        clean[k] = v.trim()
      } else {
        clean[k] = v
      }
    }
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
