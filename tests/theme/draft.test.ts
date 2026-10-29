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

  it('vocabulary strings are TRIMMED for the DB (review carry: draft keeps tail spaces)', () => {
    expect(
      normalizeThemeDraft({ vocabulary: { medal_label: 'Pingat Baru ' } }),
    ).toEqual({ vocabulary: { medal_label: 'Pingat Baru' } })
    expect(
      normalizeThemeDraft({ vocabulary: { medal_label: '  Nombor' } }),
    ).toEqual({ vocabulary: { medal_label: 'Nombor' } })
  })

  it('un-edited stored labels are preserved verbatim (validator owns the 64-char cap)', () => {
    const long = 'x'.repeat(64)
    expect(
      normalizeThemeDraft({ vocabulary: { medal_label: long } }),
    ).toEqual({ vocabulary: { medal_label: long } })
    // trim-only normalization: markup is still passed through for a label the
    // organizer never touched — sanitize at the keystroke owns markup stripping
    expect(
      normalizeThemeDraft({ vocabulary: { medal_label: ' <b>Legacy</b> ' } }),
    ).toEqual({ vocabulary: { medal_label: '<b>Legacy</b>' } })
  })

  it('trim alone cannot empty a value (no key dropped by trim)', () => {
    expect(
      normalizeThemeDraft({ vocabulary: { medal_label: ' ' } }),
    ).toEqual({ vocabulary: { medal_label: '' } })
  })

  it('non-string vocabulary values pass through unchanged (validator owns the type error)', () => {
    expect(
      normalizeThemeDraft({ vocabulary: { medal_label: 42 as never } }),
    ).toEqual({ vocabulary: { medal_label: 42 } })
  })
})

describe('assets/typography sections (P2 Task 7 — allowlist projection + omit-only)', () => {
  const ASSET_URL = 'https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/event-themes/organizers/o1/events/e1/banner-v1.png'
  const FONT_URL = 'https://fonts.gstatic.com/s/prata/v22/6xKhdSpbNNCT-sWPCm4.woff2'

  it('seed projects only known string values; unknown keys and nulls are rejected', () => {
    const seeded = seedThemeDraft({
      assets: {
        banner_url: ASSET_URL,
        evil_url: 'https://evil.com/x.png',
        old_key: 42, // unknown key of the wrong type
        logo_url: null,
      } as never,
      typography: { heading_font_url: FONT_URL, family: 'Prata' } as never,
    })
    expect(seeded.assets).toEqual({ banner_url: ASSET_URL })
    expect(seeded.typography).toEqual({ heading_font_url: FONT_URL })
  })

  it('normalize drops null leaves and non-strings from assets/typography (omit-reset semantics)', () => {
    expect(
      normalizeThemeDraft({
        assets: { banner_url: null, logo_url: ASSET_URL, badge_icon_url: 42 as never },
        typography: { heading_font_url: null, body_font_url: FONT_URL },
      } as never),
    ).toEqual({
      assets: { logo_url: ASSET_URL },
      typography: { body_font_url: FONT_URL },
    })
  })

  it('a section with nothing left drops out entirely (removed last asset → no assets key)', () => {
    expect(
      normalizeThemeDraft({ colors: { primary: '#123456' }, assets: { banner_url: null } } as never),
    ).toEqual({ colors: { primary: '#123456' } })
  })

  it('empty draft with assets still → null (full reset)', () => {
    expect(normalizeThemeDraft({ assets: {} } as never)).toBeNull()
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
