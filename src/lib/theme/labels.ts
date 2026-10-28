/**
 * Vocabulary labels — spec §5.2: sanitization + platform fallback map +
 * preview templates. Single source of label truth for runner pages, the cert
 * payload, and the vocab editor.
 *
 * Output is ALWAYS plain strings: consumers render labels as React text
 * children only — never dangerouslySetInnerHTML (Global Constraints).
 */
import type { LabelKey } from './types'

/** The six fixed vocabulary keys (Global Constraints; DB cap 64, UI cap 40). */
export const LABEL_KEYS = [
  'bib_label',
  'checkpoint_label',
  'medal_label',
  'run_label',
  'participant_label',
  'certificate_label',
] as const

/** Platform fallbacks — bib is included so presets like Batik Heritage
 * (bib_label absent by design) still resolve a full label map. */
const FALLBACKS: Record<LabelKey, string> = {
  bib_label: 'Bib Number',
  checkpoint_label: 'Checkpoint',
  medal_label: 'Medal',
  run_label: 'Run',
  participant_label: 'Participant',
  certificate_label: 'Certificate',
}

/** UI cap (Global Constraints) — DB allows 64, the UI shows 40. Exported for
 * the Task 13 editor's live 40-char cap (reviewer-approved carry). */
export const LABEL_MAX = 40

/**
 * Trim, collapse whitespace, strip HTML markup + stray angle brackets +
 * C0 control characters, cap at 40 chars. Never throws; degenerate input
 * sanitizes to '' (caller applies the fallback).
 */
export function sanitizeLabel(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // well-formed <…> markup (incl. <b>Scroll</b>)
    .replace(/[<>]/g, '') // stray unclosed brackets
    .replace(/\s+/g, ' ') // collapse whitespace runs (tabs/newlines → space)
    .replace(/[\u0000-\u001F]/g, '') // remaining C0 controls
    .trim()
    .slice(0, LABEL_MAX)
}

/** Platform fallback for a key; unknown keys → '' (ignored). */
export function fallbackLabel(key: string): string {
  return (LABEL_KEYS as readonly string[]).includes(key)
    ? FALLBACKS[key as LabelKey]
    : ''
}

/**
 * Raw vocabulary (partial, untrusted shapes tolerated at runtime) → the full
 * 6-key label map: sanitized values win, empty/missing → platform fallback.
 */
export function resolveLabels(raw: Record<string, string> | null): Record<LabelKey, string> {
  const out = {} as Record<LabelKey, string>
  for (const key of LABEL_KEYS) {
    const value = raw?.[key]
    const clean = typeof value === 'string' ? sanitizeLabel(value) : ''
    out[key] = clean.length > 0 ? clean : fallbackLabel(key)
  }
  return out
}

/** Preview template for the vocab editor (spec §5.2, e.g. "Your Bib Number #1234"). */
export function labelPreview(label: string): string {
  return `Your ${label} #1234`
}
