import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeThemeConfig, getResolvedTheme } from '@/lib/theme/resolve'
import type { ThemeTokens } from '@/lib/theme/types'
import { hexToOklch, oklchToString, deriveDarkVariant } from '@/lib/theme/color'

// Platform tokens mirror src/app/globals.css (:root / .dark) — if globals
// change, these literals intentionally fail to flag the drift.
const PLATFORM = {
  primaryLight: 'oklch(0.51 0.16 190)',
  primaryDark: 'oklch(0.75 0.13 190)',
  secondaryLight: 'oklch(0.92 0 0)',
  ringLight: 'oklch(0.51 0.16 190)',
}

const BATIK: ThemeTokens = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
  vocabulary: { bib_label: 'Nombor', medal_label: 'Pingat' },
  meta: { version: 1 },
}

const PRESET_ID = '11111111-1111-1111-1111-111111111111'

type PresetRow = { id: string; tokens: unknown } | null

/** Minimal chainable mock of the only supabase query resolve.ts makes. */
function fakeSupabase(row: PresetRow, error: unknown = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

function eventRow(theme_config: unknown): {
  theme_preset_id: string
  theme_config: unknown
} {
  return { theme_preset_id: PRESET_ID, theme_config }
}

describe('mergeThemeConfig', () => {
  it('merges deep — event wins on leaf conflicts, preset keys survive', () => {
    const merged = mergeThemeConfig(BATIK, {
      colors: { primary: '#123456' },
      vocabulary: { medal_label: 'Pingat Baru' },
    })
    expect(merged.colors?.primary).toBe('#123456')
    expect(merged.colors?.secondary).toBe('#3E2C23')
    expect(merged.vocabulary?.bib_label).toBe('Nombor')
    expect(merged.vocabulary?.medal_label).toBe('Pingat Baru')
  })

  it('null override key drops the key (→ platform default downstream)', () => {
    const merged = mergeThemeConfig(BATIK, { colors: { primary: null } })
    expect(merged.colors && 'primary' in merged.colors).toBe(false)
    expect(merged.colors?.secondary).toBe('#3E2C23')
  })

  it('null override section drops the whole section (section-level reset)', () => {
    const merged = mergeThemeConfig(BATIK, { vocabulary: null } as unknown as ThemeTokens)
    expect(merged.vocabulary).toBeUndefined()
    expect(merged.colors?.primary).toBe('#9C4A1A')
  })

  it('drops unknown keys silently — top-level, nested, and non-object sections', () => {
    const merged = mergeThemeConfig(BATIK, {
      evil: { x: 1 },
      colors: { primary: '#123456', evil: '#000000' },
      typography: 'red',
      assets: ['nope'],
    } as unknown as ThemeTokens)
    expect(Object.keys(merged).sort()).toEqual(['colors', 'meta', 'vocabulary'])
    expect(merged.colors).toEqual({
      primary: '#123456',
      secondary: '#3E2C23',
      accent: '#D4A017',
      ring: '#C68B2E',
    })
  })

  it('fuzz: malformed preset/override never throw', () => {
    const garbage = [null, 42, 'x', [], { colors: 5 }, { colors: { primary: { deep: true } } }]
    for (const g of garbage) {
      expect(() =>
        mergeThemeConfig(g as unknown as ThemeTokens, g as unknown as ThemeTokens),
      ).not.toThrow()
      expect(() => mergeThemeConfig(BATIK, g as unknown as ThemeTokens)).not.toThrow()
    }
  })
})

describe('getResolvedTheme', () => {
  it('no preset id → platform theme, no warnings', async () => {
    const resolved = await getResolvedTheme(fakeSupabase(null), { theme_preset_id: null, theme_config: null })
    expect(resolved.primary).toEqual({
      light: PLATFORM.primaryLight,
      dark: PLATFORM.primaryDark,
      fgLight: 'oklch(1 0 0)',
      fgDark: 'oklch(0.15 0.04 190)',
    })
    expect(resolved.secondary.light).toBe(PLATFORM.secondaryLight)
    expect(resolved.ring.light).toBe(PLATFORM.ringLight)
    expect(resolved.background).toEqual({ light: null, dark: null })
    expect(resolved.warnings).toEqual([])
    expect(resolved.source).toEqual({ presetId: null, overriddenKeys: [] })
  })

  it('missing preset row → platform theme + warning', async () => {
    const resolved = await getResolvedTheme(fakeSupabase(null), eventRow(null))
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.warnings.length).toBeGreaterThan(0)
    expect(resolved.source.presetId).toBeNull()
  })

  it('preset query error → platform theme + warning (never throws)', async () => {
    const resolved = await getResolvedTheme(fakeSupabase(null, new Error('boom')), eventRow(null))
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.warnings.length).toBeGreaterThan(0)
  })

  it('resolves preset ⊕ override end-to-end: labels filled, dark derived, source tracked', async () => {
    const override = { vocabulary: { bib_label: 'Nombor Larian' } }
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow(override),
    )
    // light = oklch string of the validated HEX
    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#9C4A1A')))
    // dark = deriveDarkVariant (same hue, L clamp [0.68, 0.82], C ×0.85 cap 0.20)
    expect(resolved.primary.dark).toBe(deriveDarkVariant('#9C4A1A'))
    // labels: override wins, preset survives, platform fallback fills the rest
    expect(resolved.labels.bib_label).toBe('Nombor Larian')
    expect(resolved.labels.medal_label).toBe('Pingat')
    expect(resolved.labels.checkpoint_label).toBe('Checkpoint')
    expect(resolved.labels.certificate_label).toBe('Certificate')
    // source
    expect(resolved.source.presetId).toBe(PRESET_ID)
    expect(resolved.source.overriddenKeys).toEqual(['vocabulary.bib_label'])
  })

  it('null override key → platform default color', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({ colors: { primary: null } }),
    )
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.secondary.light).toBe(oklchToString(hexToOklch('#3E2C23')))
  })

  it('malformed override HEX degrades to platform + warning', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({ colors: { primary: 'not-a-hex' } }),
    )
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.warnings.some((w) => w.includes('colors.primary'))).toBe(true)
    // degraded keys do not count as overridden
    expect(resolved.source.overriddenKeys).toEqual([])
  })

  it('contrast precheck: primary <3:1 vs platform background degrades; ring only warns', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({ colors: { primary: '#909090', ring: '#909090' } }),
    )
    // ~2.9:1 vs the light platform background → primary degrades to platform
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.warnings.some((w) => w.includes('colors.primary') && w.includes('contrast'))).toBe(true)
    // ring keeps the themed color, warning only
    expect(resolved.ring.light).toBe(oklchToString(hexToOklch('#909090')))
    expect(resolved.warnings.some((w) => w.includes('colors.ring'))).toBe(true)
  })

  it('fg pairing: fgLight from pickForeground(HEX); fgDark assigned directly, never derived from oklch', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({ colors: { primary: '#777777', secondary: '#3E2C23' } }),
    )
    // mid-tone: passes the 3:1 fill-vs-background gate (4.07:1) but white text
    // on it is <4.5:1 → pickForeground returns the dark fg companion
    expect(resolved.primary.fgLight).toBe('oklch(0.145 0 0)')
    // carried requirement (Task 6 review): dark fg is the platform constant,
    // NOT pickForeground of the dark oklch string (parseHex is HEX-only)
    expect(resolved.primary.fgDark).toBe('oklch(0.145 0 0)')
    // dark preset wood color → white foreground in light mode
    expect(resolved.secondary.fgLight).toBe('#ffffff')
    expect(resolved.secondary.fgDark).toBe('oklch(0.145 0 0)')
  })

  it('optional background/foreground slots: valid HEX → oklch, else null (platform)', async () => {
    const ok = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({ colors: { background: '#FBF6EC', foreground: '#2B2118' } }),
    )
    expect(ok.background).toEqual({ light: oklchToString(hexToOklch('#FBF6EC')), dark: null })
    expect(ok.foreground).toEqual({ light: oklchToString(hexToOklch('#2B2118')), dark: null })

    const bad = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({ colors: { background: '#zzzzzz' } }),
    )
    expect(bad.background).toEqual({ light: null, dark: null })
    expect(bad.warnings.some((w) => w.includes('colors.background'))).toBe(true)
  })

  it('fonts: https URLs kept, non-https dropped + warning', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({
        typography: { heading_font_url: 'http://evil.com/x.woff2', body_font_url: 'https://fonts.gstatic.com/b.woff2' },
      }),
    )
    expect(resolved.fonts.heading).toBeNull()
    expect(resolved.fonts.body).toBe('https://fonts.gstatic.com/b.woff2')
    expect(resolved.warnings.some((w) => w.includes('typography.heading_font_url'))).toBe(true)
  })

  it('fuzz: malformed theme_config shapes never throw', async () => {
    for (const cfg of [42, 'x', [], { colors: 5 }, { vocabulary: { bib_label: 42 } }, { colors: { primary: { deep: true } } }]) {
      const resolved = await getResolvedTheme(
        fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
        eventRow(cfg),
      )
      expect(resolved.primary).toBeTruthy()
      expect(resolved.labels.bib_label).toBeTruthy()
    }
  })
})
