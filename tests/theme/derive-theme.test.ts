import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { deriveTheme } from '@/lib/theme/resolve'
import type { ThemeTokens } from '@/lib/theme/types'
import { oklchToString, hexToOklch, deriveDarkVariant } from '@/lib/theme/color'

// assetValueOk pins https asset values to the platform storage origin and
// reads NEXT_PUBLIC_SUPABASE_URL per call — same env stub as
// tests/theme/utils.test.ts (per-file isolation). P3 Task 7.
const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
})
afterAll(() => {
  if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
})

/**
 * deriveTheme — the pure, isomorphic derivation half of the resolver. The
 * editor's live preview (Task 13) runs it client-side with the selected
 * preset's tokens ⊕ the override draft; getResolvedTheme wraps it with the
 * preset DB load. Never throws on malformed input (spec §5.5).
 */
const BATIK: ThemeTokens = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
  vocabulary: { medal_label: 'Pingat' },
  meta: { version: 1 },
}

const PRESET_ID = '11111111-1111-1111-1111-111111111111'

describe('deriveTheme', () => {
  it('preset only → themed slots, labels filled, source tracked', () => {
    const resolved = deriveTheme(BATIK, null, PRESET_ID)
    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#9C4A1A')))
    expect(resolved.primary.dark).toBe(deriveDarkVariant('#9C4A1A'))
    expect(resolved.labels.medal_label).toBe('Pingat')
    expect(resolved.labels.bib_label).toBe('Bib Number')
    expect(resolved.source).toEqual({ presetId: PRESET_ID, overriddenKeys: [] })
  })

  it('override draft wins over the preset (live preview reflects edits)', () => {
    const resolved = deriveTheme(BATIK, { colors: { primary: '#00807A' } }, PRESET_ID)
    expect(resolved.primary.light).toBe(oklchToString(hexToOklch('#00807A')))
    expect(resolved.secondary.light).toBe(oklchToString(hexToOklch('#3E2C23')))
    expect(resolved.source.overriddenKeys).toEqual(['colors.primary'])
  })

  it('custom (no preset) + malformed HEX degrades to platform + warning, never throws', () => {
    const resolved = deriveTheme({}, { colors: { primary: 'nope' } }, null)
    expect(resolved.source.presetId).toBeNull()
    expect(resolved.warnings.some((w) => w.includes('colors.primary'))).toBe(true)
  })

  it('fuzz: garbage draft shapes never throw', () => {
    for (const cfg of [42, 'x', [], { colors: 5 }, { vocabulary: { bib_label: 42 } }]) {
      const resolved = deriveTheme(BATIK, cfg as unknown as ThemeTokens, PRESET_ID)
      expect(resolved.primary).toBeTruthy()
      expect(resolved.labels.bib_label).toBeTruthy()
    }
  })
})

describe('deriveTheme assets slot (Task 10: resolved banner/logo URLs)', () => {
  it('no assets anywhere → both slots null', () => {
    const resolved = deriveTheme(BATIK, null, PRESET_ID)
    expect(resolved.assets).toEqual({ banner: null, logo: null })
    expect(resolved.source.overriddenKeys).toEqual([])
  })

  it('storage-origin https values (P3 Task 7 pin) → both slots resolved + tracked', () => {
    const banner = `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/banner-v1721000000000.png`
    const resolved = deriveTheme(
      {},
      {
        assets: {
          banner_url: banner,
          logo_url: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/logo.png`,
        },
      },
      null,
    )
    expect(resolved.assets).toEqual({
      banner,
      logo: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/logo.png`,
    })
    expect(resolved.source.overriddenKeys).toEqual(['assets.banner_url', 'assets.logo_url'])
  })

  it('hostile https asset URL (other host) → slot null + warning, never throw (P3 Task 7)', () => {
    const resolved = deriveTheme({}, { assets: { banner_url: 'https://evil.com/a.png' } }, null)
    expect(resolved.assets.banner).toBeNull()
    expect(resolved.source.overriddenKeys).toEqual([])
    expect(resolved.warnings.some((w) => w.includes('assets.banner_url'))).toBe(true)
  })

  it('Task 11 rider: 076-legal bucket path (the uploader-drafted shape) resolves RAW (consumers expand)', () => {
    const path = 'organizers/org-1/events/e-1/banner-v1720000000000.png'
    const resolved = deriveTheme({}, { assets: { banner_url: path } }, null)
    expect(resolved.assets.banner).toBe(path)
    expect(resolved.source.overriddenKeys).toEqual(['assets.banner_url'])
    expect(resolved.warnings).toEqual([])
  })

  it('preset carries assets, override drops one via null → merge semantics apply', () => {
    const withAssets: ThemeTokens = {
      ...BATIK,
      assets: {
        banner_url: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/b.png`,
        logo_url: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/l.png`,
      },
    }
    const resolved = deriveTheme(withAssets, { assets: { logo_url: null } } as unknown as ThemeTokens, PRESET_ID)
    expect(resolved.assets).toEqual({
      banner: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/b.png`,
      logo: null,
    })
    expect(resolved.source.overriddenKeys).toEqual([])
  })

  it('hostile/junk values (hand-crafted JSONB) degrade to null + warning, never throw', () => {
    for (const junk of ['javascript:alert(1)', 'http://evil.example/x.png', '../escape.png', 42]) {
      const resolved = deriveTheme(
        BATIK,
        { assets: { banner_url: junk } } as unknown as ThemeTokens,
        PRESET_ID,
      )
      expect(resolved.assets.banner).toBeNull()
      // Degraded keys don't count as overrides (warning path, same as fonts).
      expect(resolved.source.overriddenKeys).toEqual([])
      expect(resolved.warnings.some((w) => w.includes('assets.banner_url'))).toBe(true)
    }
  })

  it('fuzz: garbage assets sections never throw', () => {
    for (const cfg of [{ assets: 5 }, { assets: 'x' }, { assets: { badge_icon_url: 1 } }]) {
      const resolved = deriveTheme(BATIK, cfg as unknown as ThemeTokens, PRESET_ID)
      expect(resolved.assets).toEqual({ banner: null, logo: null })
    }
  })
})
