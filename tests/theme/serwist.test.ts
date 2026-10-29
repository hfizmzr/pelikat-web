import { describe, it, expect } from 'vitest'
import {
  THEME_ASSET_PATH_PREFIX,
  THEME_ASSET_MAX_AGE_SECONDS,
  THEME_ASSET_MAX_ENTRIES,
  themeAssetMatcherSource,
} from '@/lib/theme/serwist'

/**
 * P2 Task 7 — the Serwist matcher is build-only (src/app/sw.ts compiles in a
 * webpack child compilation), so the matcher SOURCE is pinned here as an
 * exported constant consumed by it (plan: "if sw file is build-only, pin the
 * matcher as an exported constant consumed by it and test THAT").
 */

describe('theme-asset runtime-cache matcher source', () => {
  it('escapes the storage origin + exact event-themes prefix', () => {
    expect(themeAssetMatcherSource('https://ugexrrslijmwtieevjbs.supabase.co')).toBe(
      '^https://ugexrrslijmwtieevjbs\\.supabase\\.co/storage/v1/object/public/event-themes/',
    )
    expect(THEME_ASSET_PATH_PREFIX).toBe('/storage/v1/object/public/event-themes/')
  })

  it('matches theme-asset URLs on the platform origin (wrapped in the SW route)', () => {
    const pattern = new RegExp(themeAssetMatcherSource('https://ugexrrslijmwtieevjbs.supabase.co') ?? '')
    expect(pattern.test('https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/event-themes/organizers/org-1/events/e-1/banner-v1.png')).toBe(true)
  })

  it('never matches other buckets (certificates) or other hosts', () => {
    const pattern = new RegExp(themeAssetMatcherSource('https://ugexrrslijmwtieevjbs.supabase.co') ?? '')
    expect(pattern.test('https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/certificates/tenant/cert.pdf')).toBe(false)
    expect(pattern.test('https://evil.example.com/storage/v1/object/public/event-themes/organizers/org-1/events/e-1/banner-v1.png')).toBe(false)
    // a sibling route of the app origin must not match either
    expect(pattern.test('https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/event-themes-something/x.png')).toBe(false)
  })

  it('rejects http origins, garbage and unset input (matcher omitted entirely)', () => {
    expect(themeAssetMatcherSource('http://ugexrrslijmwtieevjbs.supabase.co')).toBeNull()
    expect(themeAssetMatcherSource('not-a-url')).toBeNull()
    expect(themeAssetMatcherSource('')).toBeNull()
    expect(themeAssetMatcherSource(undefined)).toBeNull()
    expect(themeAssetMatcherSource(42)).toBeNull()
  })

  it('pins the plan Task 7 cache policy numbers (7 days, 60 entries)', () => {
    expect(THEME_ASSET_MAX_AGE_SECONDS).toBe(604800)
    expect(THEME_ASSET_MAX_ENTRIES).toBe(60)
  })
})
