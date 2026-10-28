import { describe, it, expect } from 'vitest'
import { seedThemeDraft, normalizeThemeDraft, themeDraftEquals } from '@/lib/theme/draft'

/**
 * Editor draft-state semantics (Task 13, carried requirements from Tasks 3/9):
 *  - per-key reset = OMIT the key; the editor must never produce nested JSON
 *    nulls (validate.ts + 076 reject explicit nulls at every level)
 *  - an empty draft normalizes to null = full reset (theme_config SQL NULL)
 *  - drafts are compared order-independently (jsonb row order is not stable)
 */
describe('seedThemeDraft', () => {
  it('copies plain-object sections; nulls/garbage sections are omitted (never carried as JSON nulls)', () => {
    const seeded = seedThemeDraft({
      colors: { primary: '#123456' },
      vocabulary: null,
      typography: 'garbage',
      meta: { version: 1 },
      evil: { x: 1 },
    })
    expect(seeded).toEqual({ colors: { primary: '#123456' } })
  })

  it('canonicalizes edited-section key order (jsonb row order is not stable)', () => {
    const seeded = seedThemeDraft({ colors: { ring: '#000000', primary: '#123456' } })
    expect(Object.keys(seeded.colors ?? {})).toEqual(['primary', 'ring'])
  })
})

describe('normalizeThemeDraft', () => {
  it('drops empty sections; an empty draft → null (full reset = SQL NULL)', () => {
    expect(normalizeThemeDraft({ colors: {}, vocabulary: {} })).toBeNull()
    expect(normalizeThemeDraft({ colors: { primary: '#123456' }, vocabulary: {} })).toEqual({
      colors: { primary: '#123456' },
    })
  })

  it('never emits nested nulls — null leaves are omitted', () => {
    const payload = normalizeThemeDraft({ colors: { primary: null } } as never)
    expect(payload).toBeNull()
  })

  it('null/non-object drafts normalize to null', () => {
    expect(normalizeThemeDraft(null)).toBeNull()
    expect(normalizeThemeDraft(42 as never)).toBeNull()
  })
})

describe('themeDraftEquals', () => {
  it('key-order independent', () => {
    expect(
      themeDraftEquals(
        { colors: { primary: '#123456', ring: '#000000' } },
        { colors: { ring: '#000000', primary: '#123456' } },
      ),
    ).toBe(true)
  })

  it('distinguishes content and null', () => {
    expect(themeDraftEquals({ colors: { primary: '#123456' } }, { colors: { primary: '#654321' } })).toBe(false)
    expect(themeDraftEquals(null, { colors: { primary: '#123456' } })).toBe(false)
    expect(themeDraftEquals(null, null)).toBe(true)
  })
})
