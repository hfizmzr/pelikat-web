import { describe, it, expect, beforeAll, afterAll } from 'vitest'
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
const EVENT_ID = '00000000-0000-4000-8000-00000000000e'

type PresetRow = { id: string; tokens: unknown } | null

/** Minimal chainable mock of the only supabase queries resolve.ts makes:
 * the theme_presets select (Task 11) + the get_event_theme RPC fallback
 * (review carry). Pass `rpc` to arm the fallback; `rpcCalls` is inspectable. */
function fakeSupabase(
  row: PresetRow,
  error: unknown = null,
  rpc: { data: unknown; error: unknown } | null = null,
): SupabaseClient & { rpcCalls: { fn: string; args: unknown }[] } {
  const rpcCalls: { fn: string; args: unknown }[] = []
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error }),
        }),
      }),
    }),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve(rpc ?? { data: null, error: null })
    },
  }
  return Object.assign(client as unknown as SupabaseClient, { rpcCalls })
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
    const merged = mergeThemeConfig(BATIK, { colors: { primary: null } } as unknown as ThemeTokens)
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

  // Review carry (resolve.ts:326): organizer-kind presets are RLS-hidden from
  // runner/anon callers — the §4.3 RPC fallback resolves them nonetheless.
  const THEMED_ROW = { id: EVENT_ID, theme_preset_id: PRESET_ID, theme_config: null }
  const MERGED_RPC = { colors: { primary: '#9C4A1A' }, vocabulary: { medal_label: 'Pingat' }, meta: { version: 1 } }

  it('RLS-hidden preset + event id → get_event_theme RPC fallback invoked, tokens applied', async () => {
    const client = fakeSupabase(null, null, { data: MERGED_RPC, error: null })
    const resolved = await getResolvedTheme(client, THEMED_ROW)
    expect(client.rpcCalls).toHaveLength(1)
    expect(client.rpcCalls[0].fn).toBe('get_event_theme')
    expect(client.rpcCalls[0].args).toEqual({ event_id: EVENT_ID })
    expect(resolved.labels.medal_label).toBe('Pingat')
    expect(oklchToString(hexToOklch('#9C4A1A'))).toBe(resolved.primary.light)
    expect(resolved.source.presetId).toBe(PRESET_ID)
    expect(resolved.warnings.some((w) => w.includes('RPC'))).toBe(true)
  })

  it('config still wins over the RPC fallback base (event-wins merge kept)', async () => {
    const client = fakeSupabase(null, null, { data: MERGED_RPC, error: null })
    const resolved = await getResolvedTheme(client, {
      ...THEMED_ROW,
      theme_config: { vocabulary: { medal_label: 'Pingat Baru' } },
    })
    expect(resolved.labels.medal_label).toBe('Pingat Baru')
    expect(resolved.source.overriddenKeys).toEqual(['vocabulary.medal_label'])
  })

  it('visible preset row → direct select path, NO rpc call', async () => {
    const client = fakeSupabase({ id: PRESET_ID, tokens: BATIK }, null, { data: MERGED_RPC, error: null })
    const resolved = await getResolvedTheme(client, THEMED_ROW)
    expect(client.rpcCalls).toHaveLength(0)
    expect(resolved.source.presetId).toBe(PRESET_ID)
    expect(resolved.labels.medal_label).toBe('Pingat')
    // no LOAD-stage warnings (derive-level contrast warnings are orthogonal)
    expect(resolved.warnings.some((w) => w.includes('RPC') || w.includes('preset'))).toBe(false)
  })

  it('RPC error → degrade to platform + warning, no throw', async () => {
    const client = fakeSupabase(null, null, { data: null, error: { message: 'permission denied' } })
    const resolved = await getResolvedTheme(client, THEMED_ROW)
    expect(client.rpcCalls).toHaveLength(1)
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.labels.medal_label).toBe('Medal')
    expect(resolved.warnings.length).toBeGreaterThan(0)
  })

  it('RPC throws → caught, platform + warning (never throws)', async () => {
    const client = fakeSupabase(null)
    ;(client as unknown as { rpc: () => Promise<never> }).rpc = () => Promise.reject(new Error('rpc down'))
    const resolved = await getResolvedTheme(client, THEMED_ROW)
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.warnings.length).toBeGreaterThan(0)
  })

  it('missing preset row WITHOUT an event id → legacy degrade (no rpc attempted)', async () => {
    const client = fakeSupabase(null, null, { data: MERGED_RPC, error: null })
    const resolved = await getResolvedTheme(client, eventRow(null))
    expect(client.rpcCalls).toHaveLength(0)
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
      eventRow({ colors: { primary: '#949494', ring: '#949494' } }),
    )
    // 2.91:1 vs the light platform background (#fafafa, color.ts
    // PLATFORM_BG_HEX). #909090 was the original probe but sits at 3.06:1 vs
    // the true background — inside the 3.0–3.06 band where the old #f4f4f4
    // proxy disagreed with the save-gate; #949494 degrades under both.
    expect(resolved.primary.light).toBe(PLATFORM.primaryLight)
    expect(resolved.warnings.some((w) => w.includes('colors.primary') && w.includes('contrast'))).toBe(true)
    // ring keeps the themed color, warning only
    expect(resolved.ring.light).toBe(oklchToString(hexToOklch('#949494')))
    expect(resolved.warnings.some((w) => w.includes('colors.ring'))).toBe(true)
  })

  describe('Ruling #10 — secondary/accent fg-companion gating (P2 Task 5)', () => {
    // Degraded slots return resolve.ts's PLATFORM_SLOTS verbatim (mirrors
    // globals.css — companion clausing same as the platform-theme test above).
    const DEGRADED = {
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
    }

    async function resolveColors(colors: Record<string, string>) {
      return getResolvedTheme(fakeSupabase({ id: PRESET_ID, tokens: BATIK }), eventRow({ colors }))
    }

    it('Batik gold #D4A017 accent RENDERS: fill kept, dark-text companion ≥4.5:1, no warning', async () => {
      const resolved = await resolveColors({ accent: '#D4A017' })
      expect(resolved.accent.light).toBe(oklchToString(hexToOklch('#D4A017')))
      expect(resolved.accent.dark).toBe(deriveDarkVariant('#D4A017'))
      // White on gold fails (2.38:1) → pickForeground picks its dark fg,
      // which measures 8.33:1 ≥ 4.5 — dark text on gold. Plan Task 5, req 1.
      expect(resolved.accent.fgLight).toBe('oklch(0.145 0 0)')
      expect(resolved.accent.fgDark).toBe('oklch(0.145 0 0)')
      expect(resolved.warnings.some((w) => w.includes('colors.accent'))).toBe(false)
      expect(resolved.source.overriddenKeys).toContain('colors.accent')
    })

    it('white-companion fill also passes: #949494 secondary kept (dark companion 6.52:1)', async () => {
      // P1 degraded this (2.91:1 vs bg < 3); companion rule lets it render —
      // pickForeground's dark fg clears 4.5:1 (white fails at 3.03:1).
      const resolved = await resolveColors({ secondary: '#949494' })
      expect(resolved.secondary.light).toBe(oklchToString(hexToOklch('#949494')))
      expect(resolved.warnings.some((w) => w.includes('colors.secondary'))).toBe(false)
    })

    it('fails-companion fill degrades fill AND fg in BOTH slots + warning, never throws', async () => {
      // #777777/#787878 sit in pickForeground's dead band: white 4.48/4.42:1,
      // dark fg 4.42/4.48:1 — BOTH candidates just under 4.5 → no qualifying
      // companion. Degrade + structured warning; degraded keys not overridden.
      const resolved = await resolveColors({ secondary: '#777777', accent: '#787878' })
      expect(resolved.secondary).toEqual(DEGRADED.secondary)
      expect(resolved.accent).toEqual(DEGRADED.accent)
      for (const role of ['secondary', 'accent'] as const) {
        expect(
          resolved.warnings.some(
            (w) => w.includes(`colors.${role}`) && w.includes('companion') && w.includes('4.5'),
          ),
        ).toBe(true)
      }
      expect(resolved.source.overriddenKeys).toEqual([])
    })

    it('plan Task 5 vector note: #EDEDED/#FFFFFF KEEP rendering (dark companions ≥4.5:1)', async () => {
      // Plan Task 5 lists these as "fails-companion → degrades", but that
      // outcome is numerically impossible under the plan's own @manager-locked
      // rule: their WHITE companions fail, so pickForeground pairs the DARK
      // companion, which passes hugely (16.9:1 / 19.8:1) — same pairing the
      // platform secondary slot itself uses (oklch(0.92) + dark fg). Locked
      // rule wins: asserts the rule outcome for the record.
      const resolved = await resolveColors({ secondary: '#EDEDED', accent: '#FFFFFF' })
      expect(resolved.secondary.light).toBe(oklchToString(hexToOklch('#EDEDED')))
      expect(resolved.accent.light).toBe(oklchToString(hexToOklch('#FFFFFF')))
      expect(resolved.secondary.fgLight).toBe('oklch(0.145 0 0)')
      expect(resolved.accent.fgLight).toBe('oklch(0.145 0 0)')
      expect(resolved.warnings.some((w) => w.includes('colors.secondary'))).toBe(false)
      expect(resolved.warnings.some((w) => w.includes('colors.accent'))).toBe(false)
    })
  })

  it('fg pairing: fgLight from pickForeground(HEX); fgDark assigned directly, never derived from oklch', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({ colors: { primary: '#777777', secondary: '#3E2C23' } }),
    )
    // mid-tone: passes the 3:1 fill-vs-background gate (4.29:1 vs #fafafa) but
    // white text on it is <4.5:1 → pickForeground returns the dark fg companion
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

describe('resolve-time §5.4 font-URL floor (P2 Task 3 — drop + warn, never throw)', () => {
  // Platform storage origin for the font allowlist (spec §5.4). utils.ts reads
  // NEXT_PUBLIC_SUPABASE_URL per call — same env stub as tests/theme/utils.test.ts.
  const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
  const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
  })
  afterAll(() => {
    if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
  })

  it('hostile pre-existing row: non-allowlisted URL → slot dropped + warning, never throws', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({
        typography: {
          heading_font_url: 'https://evil.com/a.woff2',
          body_font_url: 'https://fonts.gstatic.com/s/../x.woff2',
        },
      }),
    )
    expect(resolved.fonts.heading).toBeNull()
    expect(resolved.fonts.body).toBeNull()
    expect(resolved.warnings.some((w) => w.includes('typography.heading_font_url'))).toBe(true)
    expect(resolved.warnings.some((w) => w.includes('typography.body_font_url'))).toBe(true)
  })

  it('valid pre-existing rows: gstatic + storage-origin woff2 slots intact and used', async () => {
    const resolved = await getResolvedTheme(
      fakeSupabase({ id: PRESET_ID, tokens: BATIK }),
      eventRow({
        typography: {
          heading_font_url: 'https://fonts.gstatic.com/s/prata/v20/prata-46Rm.woff2',
          body_font_url: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/o/e/body_font-v1.woff2`,
        },
      }),
    )
    expect(resolved.fonts.heading).toBe('https://fonts.gstatic.com/s/prata/v20/prata-46Rm.woff2')
    expect(resolved.fonts.body).toBe(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/o/e/body_font-v1.woff2`)
    expect(resolved.warnings.filter((w) => w.includes('typography'))).toEqual([])
    expect(resolved.source.overriddenKeys).toContain('typography.heading_font_url')
    expect(resolved.source.overriddenKeys).toContain('typography.body_font_url')
  })
})
