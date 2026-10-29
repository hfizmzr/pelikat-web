/**
 * Inline style-var + @font-face builders — spec §5.3 (two-tier injection) and
 * §5.4 (typography allowlist).
 *
 * buildStyleVars emits the PRIVATE intermediates (`--et-*`) for the scope div;
 * the static stylesheet (src/app/event-theme.css) maps them onto the Tailwind
 * theme vars inside `.event-theme`. The stylesheet whitelist is the hard
 * boundary (spec §5.3) — this module only produces values, and ONLY for the
 * whitelisted tokens (no --background/--foreground pairs: they are
 * structurally unreachable).
 *
 * Dark slots are opaque `oklch()` STRINGS from resolve.ts — passed through
 * verbatim, never re-parsed (Task 6 carried requirement).
 */
import type { CSSProperties } from 'react'
import type { BrandSlot, ResolvedTheme } from './types'
import { themeFontUrlOk } from './utils'

/** The four themed roles, in injection order. */
const ROLES = ['primary', 'secondary', 'accent', 'ring'] as const

/**
 * @param resolved — output of resolve.ts (never throws upstream).
 * @param eventId — event uuid. Required for font vars: the themed font families
 *   are system-generated per event (`ET-{eventIdPrefix}-Heading` / `-Body`,
 *   spec §5.4), so the single-arg signature from the plan cannot emit them.
 *   Optional and call-compatible; color vars never depend on it.
 */
export function buildStyleVars(resolved: ResolvedTheme, eventId?: string): CSSProperties {
  const vars: Record<string, string> = {}
  for (const role of ROLES) {
    const slot: BrandSlot = resolved[role]
    vars[`--et-${role}`] = slot.light
    vars[`--et-${role}-dark`] = slot.dark
    vars[`--et-${role}-fg`] = slot.fgLight
    vars[`--et-${role}-fg-dark`] = slot.fgDark
  }
  if (eventId) {
    const prefix = eventIdPrefix(eventId)
    // Full fallback stack travels in the var — the static rule stays a single
    // var() deep, and the stack always ends in Geist (spec §5.4).
    if (resolved.fonts.heading) {
      vars['--et-font-heading'] = `ET-${prefix}-Heading, var(--font-geist)`
    }
    if (resolved.fonts.body) {
      vars['--et-font-body'] = `ET-${prefix}-Body, var(--font-geist)`
    }
  }
  // Custom properties are not in React's closed CSSProperties type; the cast
  // is the standard pattern for CSS-variable style objects.
  return vars as CSSProperties
}

/** `9b2f4c1e-abcd-…` → `9b2f4c1e` — the uuid's first segment, alnum-only. */
function eventIdPrefix(eventId: string): string {
  return eventId.split('-')[0]?.replace(/[^A-Za-z0-9]/g, '') || 'Event'
}

function headingFamily(eventId: string): string {
  return `ET-${eventIdPrefix(eventId)}-Heading`
}

/**
 * Font URL allowlist lives in utils.ts (`themeFontUrlOk`) — the ONE shared
 * §5.4 enforcement point, consumed by css/validate/resolve. buildFontFace
 * never throws: a slot failing the gate (or unset) simply emits no face →
 * Geist fallback, spec §5.5.
 *
 * @param eventId — drives the system families.
 * @param fonts — the resolved font slots; each set URL emits one @font-face.
 *   Every URL is re-gated here even though resolve.ts already dropped
 *   hostile ones — this is the last line of defense before the CSS string.
 */
export function buildFontFace(
  eventId: string,
  fonts: { heading?: string | null; body?: string | null },
): string {
  const heading = fontFace(eventId, 'Heading', fonts.heading)
  const body = fontFace(eventId, 'Body', fonts.body)
  // Per-block trailing newline keeps the single-face output byte-identical to
  // the P1 contract; multiple faces come out one blank line apart.
  return [heading, body].filter((block) => block !== '').join('\n')
}

function fontFace(
  eventId: string,
  variant: 'Heading' | 'Body',
  fontUrl: string | null | undefined,
): string {
  if (!fontUrl || !themeFontUrlOk(fontUrl)) return ''
  // themeFontUrlOk parsed this same string, so the constructor here cannot
  // throw; the catch keeps the never-throw contract airtight anyway.
  let url: URL
  try {
    url = new URL(fontUrl)
  } catch {
    return ''
  }
  const family = variant === 'Heading' ? headingFamily(eventId) : `ET-${eventIdPrefix(eventId)}-Body`
  return [
    '@font-face {',
    `  font-family: ${family};`,
    `  src: url("${url.href}") format("woff2");`,
    '  font-display: swap;',
    '}',
    '',
  ].join('\n')
}
