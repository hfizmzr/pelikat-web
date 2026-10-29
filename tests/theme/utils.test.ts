import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { isPlainObject, themeFontUrlOk, assetValueOk } from '@/lib/theme/utils'

// Platform storage origin for the font allowlist (spec §5.4). utils.ts reads
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

describe('isPlainObject', () => {
  it('accepts plain objects (including nested empty ones)', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject({ a: { b: {} } })).toBe(true)
  })

  it('rejects arrays, null, and scalars', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(['x'])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(undefined)).toBe(false)
    expect(isPlainObject(42)).toBe(false)
    expect(isPlainObject('str')).toBe(false)
    expect(isPlainObject(true)).toBe(false)
  })

  it('rejects built-in object flavors (Map, Date)', () => {
    expect(isPlainObject(new Map())).toBe(false)
    expect(isPlainObject(new Date())).toBe(false)
  })
})

describe('assetValueOk (076 asset value rule + P3 Task 7 origin pin)', () => {
  it('accepts relative bucket paths (076-legal: charset + no dot-dot)', () => {
    expect(assetValueOk('organizers/org-1/events/e-1/banner-v1720000000000.png')).toBe(true)
    expect(assetValueOk('banner.png')).toBe(true)
    expect(assetValueOk('a.b_c/d-e/f.webp')).toBe(true)
    expect(assetValueOk('../escape.png')).toBe(false)
    expect(assetValueOk('a/../b.png')).toBe(false)
    expect(assetValueOk('has space.png')).toBe(false)
    expect(assetValueOk('javascript:alert(1)')).toBe(false)
    expect(assetValueOk('http://evil.example/x.png')).toBe(false)
  })

  it('accepts https URLs only on the platform storage origin', () => {
    expect(
      assetValueOk(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/organizers/o/e/banner-v1.png`),
    ).toBe(true)
    // Asset-kind distinction (P3 Task 7): fonts.gstatic.com is the §5.4 FONT
    // allowlist (themeFontUrlOk) — NOT valid for ASSET values.
    expect(assetValueOk('https://fonts.gstatic.com/s/foo.woff2')).toBe(false)
    expect(assetValueOk('https://evil.com/a.png')).toBe(false)
    expect(assetValueOk('https://fonts.gstatic.com.evil.com/x.png')).toBe(false)
  })

  it('rejects non-string input and http/other schemes', () => {
    expect(assetValueOk(undefined)).toBe(false)
    expect(assetValueOk(null)).toBe(false)
    expect(assetValueOk(42)).toBe(false)
    expect(assetValueOk({})).toBe(false)
    expect(assetValueOk('')).toBe(false)
    expect(assetValueOk(`${TEST_SUPABASE_URL.replace('https', 'http')}/x.png`)).toBe(false)
  })

  it('rejects when the Supabase URL env is unset or malformed (themeFontUrlOk parity)', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(
      assetValueOk(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/x.png`),
    ).toBe(false)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url'
    expect(
      assetValueOk(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/x.png`),
    ).toBe(false)
    // Restore for the remaining tests in this file (hygiene for workers).
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
  })
})

describe('themeFontUrlOk', () => {
  it('accepts fonts.gstatic.com https .woff2 URLs', () => {
    expect(themeFontUrlOk('https://fonts.gstatic.com/s/prata/v20/x.woff2')).toBe(true)
  })

  it('accepts the platform storage origin (Supabase URL env)', () => {
    expect(
      themeFontUrlOk(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/o/e/heading.woff2`)
    ).toBe(true)
  })

  it('rejects non-string and non-URL input (unknown contract)', () => {
    expect(themeFontUrlOk(undefined)).toBe(false)
    expect(themeFontUrlOk(null)).toBe(false)
    expect(themeFontUrlOk(42)).toBe(false)
    expect(themeFontUrlOk({})).toBe(false)
    expect(themeFontUrlOk('not-a-url')).toBe(false)
    expect(themeFontUrlOk('')).toBe(false)
  })

  it('rejects non-https schemes even on allowed hosts', () => {
    expect(themeFontUrlOk('http://fonts.gstatic.com/x.woff2')).toBe(false)
    expect(
      themeFontUrlOk(`${TEST_SUPABASE_URL.replace('https', 'http')}/storage/v1/object/public/x.woff2`)
    ).toBe(false)
  })

  it('rejects non-allowlisted hosts', () => {
    expect(themeFontUrlOk('https://evil.com/x.woff2')).toBe(false)
    expect(themeFontUrlOk('https://fonts.gstatic.com.evil.com/x.woff2')).toBe(false)
  })

  it('rejects non-.woff2 extensions', () => {
    expect(themeFontUrlOk('https://fonts.gstatic.com/x.ttf')).toBe(false)
    expect(themeFontUrlOk('https://fonts.gstatic.com/x.woff')).toBe(false)
    expect(themeFontUrlOk(`${TEST_SUPABASE_URL}/x`)).toBe(false)
  })

  it('rejects unencoded ../ path traversal', () => {
    expect(themeFontUrlOk(`${TEST_SUPABASE_URL}/../x.woff2`)).toBe(false)
    expect(themeFontUrlOk('https://fonts.gstatic.com/../x.woff2')).toBe(false)
    expect(themeFontUrlOk(`${TEST_SUPABASE_URL}/storage/v1/../evil.woff2`)).toBe(false)
  })

  it('rejects percent-encoded traversal', () => {
    expect(themeFontUrlOk('https://fonts.gstatic.com/%2e%2e/x.woff2')).toBe(false)
    expect(themeFontUrlOk('https://fonts.gstatic.com/%2e%2e%2fx.woff2')).toBe(false)
    expect(themeFontUrlOk(`${TEST_SUPABASE_URL}/storage/v1%2f..%2fevil.woff2`)).toBe(false)
  })

  it('rejects when the Supabase URL env is unset or malformed', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(
      themeFontUrlOk(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/x.woff2`)
    ).toBe(false)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url'
    expect(
      themeFontUrlOk(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/x.woff2`)
    ).toBe(false)
    // Restore for any later tests in this file (none — hygiene for workers).
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
  })
})
