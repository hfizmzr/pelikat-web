import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { isPlainObject, themeFontUrlOk } from '@/lib/theme/utils'

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
