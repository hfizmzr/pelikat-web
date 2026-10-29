import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildStyleVars, buildFontFace } from '@/lib/theme/css'
import type { BrandSlot, ResolvedTheme } from '@/lib/theme/types'

// Platform storage origin for the font allowlist (spec §5.4). css.ts reads
// NEXT_PUBLIC_SUPABASE_URL per call — set before any test body runs. Vitest
// isolates workers per file, so this cannot leak into other test files.
const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
})
afterAll(() => {
  if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
})

// Distinct opaque oklch() strings per field — buildStyleVars must pass dark
// slots through UNTOUCHED (Task 6 carried requirement: never re-parse oklch).
const slot = (l: string, d: string, fl: string, fd: string): BrandSlot => ({
  light: l,
  dark: d,
  fgLight: fl,
  fgDark: fd,
})

const resolved: ResolvedTheme = {
  primary: slot('oklch(0.6 0.12 30)', 'oklch(0.7 0.1 30)', 'oklch(1 0 0)', 'oklch(0.145 0 0)'),
  secondary: slot('oklch(0.92 0 0)', 'oklch(0.16 0 0)', 'oklch(0.145 0 0)', 'oklch(0.985 0 0)'),
  accent: slot('oklch(0.85 0.15 90)', 'oklch(0.8 0.12 90)', 'oklch(0.145 0 0)', 'oklch(0.985 0 0)'),
  ring: slot('oklch(0.55 0.2 200)', 'oklch(0.75 0.15 200)', 'oklch(1 0 0)', 'oklch(0.145 0 0)'),
  background: { light: null, dark: null },
  foreground: { light: null, dark: null },
  fonts: { heading: null, body: null },
  assets: { banner: null, logo: null, certificate_background: null },
  labels: {
    bib_label: 'Bib Number',
    checkpoint_label: 'Checkpoint',
    medal_label: 'Medal',
    run_label: 'Run',
    participant_label: 'Participant',
    certificate_label: 'Certificate',
  },
  warnings: [],
  source: { presetId: null, overriddenKeys: [] },
}

describe('buildStyleVars', () => {
  it('emits light + dark + both foregrounds for all 4 brand roles', () => {
    const vars = buildStyleVars(resolved) as unknown as Record<string, string>
    const roles = ['primary', 'secondary', 'accent', 'ring'] as const
    for (const role of roles) {
      expect(vars[`--et-${role}`]).toBe(resolved[role].light)
      expect(vars[`--et-${role}-dark`]).toBe(resolved[role].dark)
      expect(vars[`--et-${role}-fg`]).toBe(resolved[role].fgLight)
      expect(vars[`--et-${role}-fg-dark`]).toBe(resolved[role].fgDark)
    }
  })

  it('passes dark slots through as opaque oklch strings (never re-parsed)', () => {
    const vars = buildStyleVars(resolved) as unknown as Record<string, string>
    expect(vars['--et-primary-dark']).toBe('oklch(0.7 0.1 30)')
    expect(vars['--et-ring-fg-dark']).toBe('oklch(0.145 0 0)')
  })

  it('omits font vars when fonts are null', () => {
    const vars = buildStyleVars(resolved) as unknown as Record<string, string>
    expect(vars['--et-font-heading']).toBeUndefined()
    expect(vars['--et-font-body']).toBeUndefined()
  })

  it('emits heading font var with system family + Geist fallback when eventId given', () => {
    const themed: ResolvedTheme = {
      ...resolved,
      fonts: { heading: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2', body: null },
    }
    const vars = buildStyleVars(themed, '9b2f4c1e-abcd-4321-9876-abcdef012345') as unknown as Record<string, string>
    expect(vars['--et-font-heading']).toBe('ET-9b2f4c1e-Heading, var(--font-geist)')
  })

  it('emits body font var with system family + Geist fallback', () => {
    const themed: ResolvedTheme = {
      ...resolved,
      fonts: { heading: null, body: 'https://fonts.gstatic.com/s/inter/v1/y.woff2' },
    }
    const vars = buildStyleVars(themed, '9b2f4c1e-abcd-4321-9876-abcdef012345') as unknown as Record<string, string>
    expect(vars['--et-font-body']).toBe('ET-9b2f4c1e-Body, var(--font-geist)')
    expect(vars['--et-font-heading']).toBeUndefined()
  })

  it('emits BOTH font vars with system families + Geist fallback when both slots set', () => {
    const themed: ResolvedTheme = {
      ...resolved,
      fonts: {
        heading: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2',
        body: 'https://fonts.gstatic.com/s/inter/v1/y.woff2',
      },
    }
    const vars = buildStyleVars(themed, '9b2f4c1e-abcd-4321-9876-abcdef012345') as unknown as Record<string, string>
    expect(vars['--et-font-heading']).toBe('ET-9b2f4c1e-Heading, var(--font-geist)')
    expect(vars['--et-font-body']).toBe('ET-9b2f4c1e-Body, var(--font-geist)')
  })

  it('omits font vars when no eventId is given (pinned single-arg signature)', () => {
    const themed: ResolvedTheme = {
      ...resolved,
      fonts: { heading: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2', body: null },
    }
    const vars = buildStyleVars(themed) as unknown as Record<string, string>
    expect(vars['--et-font-heading']).toBeUndefined()
    expect(vars['--et-font-body']).toBeUndefined()
  })
})

describe('buildFontFace', () => {
  const eventId = '9b2f4c1e-abcd-4321-9876-abcdef012345'
  const VALID = 'https://fonts.gstatic.com/s/lasso/v1/x.woff2'
  const BODY_VALID = 'https://fonts.gstatic.com/s/inter/v1/y.woff2'
  const HOSTILE = 'https://evil.example.com/x.woff2'

  it('accepts fonts.gstatic.com https woff2 and emits @font-face with system family + swap', () => {
    const css = buildFontFace(eventId, { heading: VALID })
    expect(css).toContain('font-family: ET-9b2f4c1e-Heading;')
    expect(css).toContain('font-display: swap;')
    expect(css).toContain('url("https://fonts.gstatic.com/s/lasso/v1/x.woff2") format("woff2")')
    expect(css).not.toContain('ET-9b2f4c1e-Body')
  })

  it('emits BOTH families when both slots are set', () => {
    const css = buildFontFace(eventId, { heading: VALID, body: BODY_VALID })
    expect(css).toContain('font-family: ET-9b2f4c1e-Heading;')
    expect(css).toContain('font-family: ET-9b2f4c1e-Body;')
    expect(css).toContain('url("https://fonts.gstatic.com/s/inter/v1/y.woff2") format("woff2")')
    expect(css.match(/@font-face \{/g)).toHaveLength(2)
  })

  it('emits the body face when only the body slot is set', () => {
    const css = buildFontFace(eventId, { heading: null, body: BODY_VALID })
    expect(css).toContain('font-family: ET-9b2f4c1e-Body;')
    expect(css).not.toContain('font-family: ET-9b2f4c1e-Heading;')
    expect(css.match(/@font-face \{/g)).toHaveLength(1)
  })

  it('emits nothing when neither slot is set', () => {
    expect(buildFontFace(eventId, { heading: null, body: null })).toBe('')
    expect(buildFontFace(eventId, {})).toBe('')
  })

  it('drops ONLY the hostile slot; the other face survives (per-slot gate)', () => {
    const css = buildFontFace(eventId, { heading: VALID, body: HOSTILE })
    expect(css).toContain('font-family: ET-9b2f4c1e-Heading;')
    expect(css).not.toContain('ET-9b2f4c1e-Body')
    const css2 = buildFontFace(eventId, { heading: HOSTILE, body: BODY_VALID })
    expect(css2).not.toContain('ET-9b2f4c1e-Heading')
    expect(css2).toContain('font-family: ET-9b2f4c1e-Body;')
  })

  it('accepts the platform storage origin (Supabase URL env)', () => {
    const css = buildFontFace(eventId, {
      heading: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/organizers/o/events/e/heading.woff2`,
    })
    expect(css).toContain('ET-9b2f4c1e-Heading')
    expect(css).toContain('font-display: swap;')
  })

  it('rejects non-allowlisted https hosts', () => {
    expect(buildFontFace(eventId, { heading: HOSTILE, body: null })).toBe('')
  })

  it('rejects non-https URLs even on allowed hosts', () => {
    expect(buildFontFace(eventId, { heading: 'http://fonts.gstatic.com/x.woff2', body: null })).toBe('')
    expect(
      buildFontFace(eventId, {
        heading: `${TEST_SUPABASE_URL.replace('https', 'http')}/storage/v1/object/public/event-themes/x.woff2`,
        body: null,
      }),
    ).toBe('')
  })

  it('rejects non-woff2 extensions', () => {
    expect(buildFontFace(eventId, { heading: 'https://fonts.gstatic.com/x.ttf', body: null })).toBe('')
    expect(buildFontFace(eventId, { heading: 'https://fonts.gstatic.com/x.woff', body: null })).toBe('')
    expect(buildFontFace(eventId, { heading: `${TEST_SUPABASE_URL}/x`, body: null })).toBe('')
  })

  it('rejects ../ path traversal (DB charset bypass — app-layer boundary, spec §5.4)', () => {
    // Raw dot-dot segments are rejected before URL normalization hides them.
    expect(
      buildFontFace(eventId, { heading: `${TEST_SUPABASE_URL}/../x.woff2`, body: null }),
    ).toBe('')
    expect(buildFontFace(eventId, { heading: 'https://fonts.gstatic.com/../x.woff2', body: null })).toBe('')
    expect(
      buildFontFace(eventId, { heading: `${TEST_SUPABASE_URL}/storage/v1/../evil.woff2`, body: null }),
    ).toBe('')
    expect(
      buildFontFace(eventId, { heading: 'https://fonts.gstatic.com/%2e%2e/x.woff2', body: null }),
    ).toBe('')
    // Fully-encoded traversal (`..` AND the slashes percent-encoded) — Task 14.
    expect(
      buildFontFace(eventId, { heading: 'https://fonts.gstatic.com/%2e%2e%2fx.woff2', body: null }),
    ).toBe('')
    expect(
      buildFontFace(eventId, {
        heading: `${TEST_SUPABASE_URL}/storage/v1%2f..%2fevil.woff2`,
        body: null,
      }),
    ).toBe('')
  })

  it('rejects malformed URLs', () => {
    expect(buildFontFace(eventId, { heading: 'not-a-url', body: null })).toBe('')
    expect(buildFontFace(eventId, { heading: '', body: null })).toBe('')
  })

  it('normalizes the URL (no raw spaces/quotes injected into the CSS string)', () => {
    const css = buildFontFace(eventId, { heading: 'https://fonts.gstatic.com/a b.woff2', body: null })
    expect(css).toContain('url("https://fonts.gstatic.com/a%20b.woff2")')
    // Inside the url("…") token there must be no whitespace or nested quotes.
    expect(css).toMatch(/url\("[^"\s]*"\)/)
  })

  it('sanitizes the family prefix to alphanumeric characters', () => {
    const css = buildFontFace('dead<beef>-1234', { heading: 'https://fonts.gstatic.com/x.woff2' })
    expect(css).toContain('font-family: ET-deadbeef-Heading;')
  })
})

describe('event-theme.css whitelist (hard boundary — spec §5.3)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/event-theme.css'), 'utf8')

  /** Every custom property DECLARED in the file (LHS of `--x:`). */
  function declaredProps(source: string): Set<string> {
    return new Set([...source.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]))
  }

  const WHITELIST = new Set([
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--accent',
    '--accent-foreground',
    '--ring',
  ])

  const FORBIDDEN_EXACT = [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--muted',
    '--muted-foreground',
    '--border',
    '--input',
    '--destructive',
    '--destructive-foreground',
    '--radius',
    '--success',
  ]
  const FORBIDDEN_PREFIXES = ['--chart-', '--sidebar-']

  it('declares EXACTLY the 7 brand tokens — nothing else', () => {
    const declared = declaredProps(css)
    for (const name of declared) {
      expect(WHITELIST.has(name), `non-whitelisted token declared: ${name}`).toBe(true)
    }
    for (const name of WHITELIST) {
      expect(declared.has(name), `whitelisted token missing: ${name}`).toBe(true)
    }
  })

  it('contains no forbidden platform tokens (exact or prefixed)', () => {
    const declared = declaredProps(css)
    for (const name of FORBIDDEN_EXACT) {
      expect(declared.has(name), `forbidden platform token declared: ${name}`).toBe(false)
    }
    for (const name of declared) {
      for (const prefix of FORBIDDEN_PREFIXES) {
        expect(name.startsWith(prefix), `forbidden platform token declared: ${name}`).toBe(false)
      }
    }
  })

  it('contains no raw forbidden-token substrings anywhere (belt to the declaration check)', () => {
    for (const raw of ['--background', '--foreground', '--card', '--popover', '--muted', '--border', '--input', '--destructive', '--chart-', '--sidebar-', '--radius', '--success']) {
      expect(css.includes(raw), `forbidden token substring present: ${raw}`).toBe(false)
    }
  })

  it('maps the brand tokens onto the Tailwind theme vars in both modes', () => {
    expect(css).toContain('.event-theme {')
    expect(css).toContain('--primary: var(--et-primary);')
    expect(css).toContain('--primary-foreground: var(--et-primary-fg);')
    expect(css).toContain('.dark .event-theme {')
    expect(css).toContain('--primary: var(--et-primary-dark);')
    expect(css).toContain('--primary-foreground: var(--et-primary-fg-dark);')
    expect(css).toContain('--ring: var(--et-ring-dark);')
  })

  it('heading selectors pick up the themed heading font with a platform fallback', () => {
    expect(css).toMatch(/\.event-theme h[1-6]/)
    expect(css).toContain('font-family: var(--et-font-heading, var(--font-sans));')
  })

  it('scope div picks up the themed body font with a platform fallback', () => {
    expect(css).toContain('.event-theme {')
    expect(css).toContain('font-family: var(--et-font-body, var(--font-sans));')
  })

  it('font mappings stay tier-2 (reference-only): no --et-* custom property declared', () => {
    const declared = declaredProps(css)
    for (const name of declared) {
      expect(name.startsWith('--et-'), `private intermediate declared in stylesheet: ${name}`).toBe(false)
    }
    expect(css).toContain('var(--et-font-heading,')
    expect(css).toContain('var(--et-font-body,')
  })
})
