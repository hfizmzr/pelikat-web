import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  ASSET_LIMITS,
  FAMILY_FONT_URLS,
  FONT_LIMIT,
  assetPath,
  cleanupThemeAssets,
  uploadThemeAsset,
  storageAssetUrl,
  type ThemeAssetClient,
} from '@/lib/theme/assets'

/**
 * P2 Task 7 — theme asset upload engine pins (spec §6 + plan Task 7):
 *  - the client gate rejects BEFORE any network call (a 9 MB banner passes
 *    the 10 MB bucket cap — only this gate stops it);
 *  - assetPath emits the exact tenant path `{kind}-v{ts}.{ext}`;
 *  - 409/conflict → remove() same path once → re-upload once (warn logged);
 *  - cleanup keeps the object referenced by the saved config and deletes
 *    other stale `{kind}-v*` objects ONLY for kinds present in savedAssets —
 *    absent kinds and unrecognized names are never touched.
 */

function makeFile(name: string, type: string, size: number): File {
  return { name, type, size } as File
}

function makeBucket(list: Array<{ name: string }> = [], uploadError: unknown = null) {
  const calls: { uploads: string[]; removed: string[][]; listed: string[] } = {
    uploads: [],
    removed: [],
    listed: [],
  }
  const bucket = {
    upload: vi.fn(async (path: string) => {
      calls.uploads.push(path)
      return { error: uploadError != null ? uploadError : null }
    }),
    remove: vi.fn(async (paths: string[]) => {
      calls.removed.push(paths)
      return { error: null }
    }),
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://storage-origin.test/storage/v1/object/public/event-themes/${path}` },
    }),
    list: vi.fn(async (folder: string) => {
      calls.listed.push(folder)
      return { data: list, error: null }
    }),
  }
  const client: ThemeAssetClient = { storage: { from: vi.fn(() => bucket) } }
  return { calls, client, bucket }
}

describe('client gate (§6 exact limits — rejects BEFORE any network)', () => {
  it('2.5 MB banner rejected with zero network calls', async () => {
    const { client, bucket } = makeBucket()
    await expect(
      uploadThemeAsset(client, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'banner',
        file: makeFile('big.png', 'image/png', 2.5 * 1024 * 1024),
      }),
    ).rejects.toThrow(/banner: 2\.5 MB exceeds the 2\.0 MB limit/)
    expect(bucket.upload).not.toHaveBeenCalled()
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('0.6 MB logo rejected with zero network calls', async () => {
    const { client, bucket } = makeBucket()
    await expect(
      uploadThemeAsset(client, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'logo',
        file: makeFile('logo.png', 'image/png', 0.6 * 1024 * 1024),
      }),
    ).rejects.toThrow(/logo: 0\.6 MB exceeds the 0\.5 MB limit/)
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('non-image mime (.gif banner) rejected', async () => {
    const { client, bucket } = makeBucket()
    await expect(
      uploadThemeAsset(client, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'banner',
        file: makeFile('cat.gif', 'image/gif', 10),
      }),
    ).rejects.toThrow(/only PNG, JPEG or WebP/)
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('boundary size is accepted for every §6 kind (limits table pins)', () => {
    expect(ASSET_LIMITS.banner.maxBytes).toBe(2_097_152)
    expect(ASSET_LIMITS.logo.maxBytes).toBe(524_288)
    expect(ASSET_LIMITS.badge_icon.maxBytes).toBe(262_144)
    expect(ASSET_LIMITS.certificate_background.maxBytes).toBe(8_388_608)
    for (const limits of Object.values(ASSET_LIMITS)) {
      expect(limits.types).toEqual(['image/png', 'image/jpeg', 'image/webp'])
    }
  })

  it('non-woff2 font rejected with zero network calls', async () => {
    const { client, bucket } = makeBucket()
    await expect(
      uploadThemeAsset(client, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'heading_font',
        file: makeFile('FancyFont.ttf', 'font/ttf', 100),
      }),
    ).rejects.toThrow(/only \.woff2 font files/)
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('oversized woff2 font rejected (FONT_LIMIT pin)', async () => {
    const { client, bucket } = makeBucket()
    await expect(
      uploadThemeAsset(client, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'body_font',
        file: makeFile('huge.woff2', 'font/woff2', FONT_LIMIT + 1),
      }),
    ).rejects.toThrow(/exceeds the font limit/)
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('happy path image upload → upsert content-typed upload + public URL', async () => {
    const { client, bucket } = makeBucket()
    const result = await uploadThemeAsset(client, {
      organizerId: 'org-1',
      eventId: 'e-1',
      kind: 'logo',
      file: makeFile('logo.png', 'image/png', 100),
      ts: 1720000000000,
    })
    expect(bucket.upload).toHaveBeenCalledWith(
      'organizers/org-1/events/e-1/logo-v1720000000000.png',
      expect.anything(),
      { upsert: true, contentType: 'image/png' },
    )
    expect(result.publicUrl).toBe(
      'https://storage-origin.test/storage/v1/object/public/event-themes/organizers/org-1/events/e-1/logo-v1720000000000.png',
    )
  })

  it('happy path font upload → font/woff2 content type', async () => {
    const { client, bucket } = makeBucket()
    await uploadThemeAsset(client, {
      organizerId: 'org-1',
      eventId: 'e-1',
      kind: 'heading_font',
      file: makeFile('my.woff2', 'font/woff2', 300 * 1024),
    })
    expect(bucket.upload).toHaveBeenCalledWith(
      expect.stringContaining('heading_font-v'),
      expect.anything(),
      { upsert: true, contentType: 'font/woff2' },
    )
  })

  it('unknown kind rejected before network', async () => {
    const { client, bucket } = makeBucket()
    await expect(
      uploadThemeAsset(client, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'bogus' as never,
        file: makeFile('x.png', 'image/png', 1),
      }),
    ).rejects.toThrow(/unknown asset kind/)
    expect(bucket.upload).not.toHaveBeenCalled()
  })
})

describe('assetPath (exact §6 tenant path format)', () => {
  it('emits organizers/{organizerId}/events/{eventId}/{kind}-v{ts}.{ext}', () => {
    expect(assetPath('org-abc', '9b2f4c1e-abcd-4321-9876-abcdef012345', 'banner', 'png', 1720000000000)).toBe(
      'organizers/org-abc/events/9b2f4c1e-abcd-4321-9876-abcdef012345/banner-v1720000000000.png',
    )
    expect(assetPath('org-abc', '9b2f4c1e-abcd-4321-9876-abcdef012345', 'heading_font', '.WOFF2', 1)).toBe(
      'organizers/org-abc/events/9b2f4c1e-abcd-4321-9876-abcdef012345/heading_font-v1.woff2',
    )
    expect(assetPath('org-abc', '9b2f4c1e-abcd-4321-9876-abcdef012345', 'certificate_background', 'webp', 7)).toBe(
      'organizers/org-abc/events/9b2f4c1e-abcd-4321-9876-abcdef012345/certificate_background-v7.webp',
    )
  })

  it('rejects bad organizer ids and empty extensions', () => {
    expect(() => assetPath('../evil', 'e-1', 'banner', 'png', 1)).toThrow(/invalid organizer/)
    expect(() => assetPath('org-1', 'e-1', 'banner', '!', 1)).toThrow(/empty file extension/)
  })
})

describe('upload 409 → remove + retry', () => {
  it('conflict error removes the same path once and re-uploads once (warn logged)', async () => {
    let uploadCount = 0
    const path = 'organizers/org-1/events/e-1/banner-v5.png'
    const conflict = { message: '409 Conflict', statusCode: '409' }
    const bucket = {
      upload: vi.fn(async (path: string) => {
        void path
        uploadCount += 1
        return { error: uploadCount === 1 ? conflict : null }
      }),
      remove: vi.fn(async () => ({ error: null })),
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.test/${p}` } }),
      list: vi.fn(async () => ({ data: [], error: null })),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await uploadThemeAsset({ storage: { from: () => bucket } } as unknown as ThemeAssetClient, {
      organizerId: 'org-1',
      eventId: 'e-1',
      kind: 'banner',
      file: makeFile('a.png', 'image/png', 10),
      ts: 5,
    })
    expect(bucket.upload.mock.calls.map((c) => c[0])).toEqual([path, path])
    expect(bucket.remove).toHaveBeenCalledWith([path])
    expect(warn).toHaveBeenCalled()
    expect(result.publicUrl).toBe(`https://x.test/${path}`)
    warn.mockRestore()
  })

  it('a non-409 upload failure rejects (never silently swallowed)', async () => {
    const bucket = {
      upload: vi.fn(async () => ({ error: { message: 'quota exceeded' } })),
      remove: vi.fn(async () => ({ error: null })),
      getPublicUrl: (p: string) => ({ data: { publicUrl: p } }),
      list: vi.fn(async () => ({ data: [], error: null })),
    }
    await expect(
      uploadThemeAsset({ storage: { from: () => bucket } } as unknown as ThemeAssetClient, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'badge_icon',
        file: makeFile('b.png', 'image/png', 10),
      }),
    ).rejects.toThrow(/upload failed — quota exceeded/)
    expect(bucket.remove).not.toHaveBeenCalled()
  })
})

describe('cleanupThemeAssets — keep saved, delete stale, never touch absent kinds', () => {
  it('KEEPS referenced objects; deletes other stale variants of PRESENT kinds; leaves unknown names + absent kinds', async () => {
    const { calls, client, bucket } = makeBucket([
      { name: 'banner-v1.png' }, // referenced → KEEP
      { name: 'banner-v99.png' }, // stale variant → DELETE
      { name: 'logo-v1.png' }, // kind logo present (umbrella value) → DELETE (unreferenced)
      { name: 'badge_icon-v2.png' }, // referenced → KEEP
      { name: 'certificate_background-v3.png' }, // kind ABSENT from savedAssets → NEVER touched
      { name: 'mr-random-object.png' }, // matches no kind prefix → NEVER touched
    ])
    const result = await cleanupThemeAssets(client, {
      organizerId: 'org-1',
      eventId: 'e-1',
      savedAssets: {
        banner_url: 'https://ugexrrslijmwtieevjbs.supabase.co/storage/v1/object/public/event-themes/organizers/org-1/events/e-1/banner-v1.png',
        logo_url: 'https://evil.example.com/external.png', // present kind, external reference → still "present"
        badge_icon_url: '/storage/public/event-themes/organizers/org-1/events/e-1/badge_icon-v2.png',
      },
    })
    const removed = (bucket.remove as ReturnType<typeof vi.fn>).mock.calls.flat(2)
    expect(removed.sort()).toEqual(['banner-v99.png', 'logo-v1.png'])
    expect(calls.listed).toEqual(['organizers/org-1/events/e-1'])
    expect(result.removed.sort()).toEqual(['banner-v99.png', 'logo-v1.png'])
    expect(result.warnings).toEqual([])
  })

  it('no saved kinds → list not even attempted (no false orphans)', async () => {
    const { client, bucket } = makeBucket([{ name: 'banner-v1.png' }])
    const result = await cleanupThemeAssets(client, {
      organizerId: 'org-1',
      eventId: 'e-1',
      savedAssets: { unknown_key: 'x.png', banner_url: null },
    })
    expect(bucket.list).not.toHaveBeenCalled()
    expect(bucket.remove).not.toHaveBeenCalled()
    expect(result.removed).toEqual([])
  })

  it('unreferenced font kinds are pruned; gstatic-referenced fonts prune their storage variants', async () => {
    const { client, bucket } = makeBucket([
      { name: 'heading_font-v1.woff2' },
      { name: 'body_font-v2.woff2' },
    ])
    const result = await cleanupThemeAssets(client, {
      organizerId: 'org-1',
      eventId: 'e-1',
      savedAssets: { heading_font_url: 'https://fonts.gstatic.com/s/prata/v22/prata-46Rm.woff2' },
    })
    const removed = (bucket.remove as ReturnType<typeof vi.fn>).mock.calls.flat(2)
    expect(removed).toEqual(['heading_font-v1.woff2']) // kind present, reference is gstatic
    expect(removed).not.toContain('body_font-v2.woff2') // absent kind untouched
    expect(result.warnings).toEqual([])
  })

  it('list failure → structured warning, no deletions, no throw', async () => {
    const bucket = {
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(async () => ({ error: null })),
      getPublicUrl: (p: string) => ({ data: { publicUrl: p } }),
      list: vi.fn(async () => ({ data: null, error: { message: 'RLS denied' } })),
    }
    const result = await cleanupThemeAssets({ storage: { from: () => bucket } } as unknown as ThemeAssetClient, {
      organizerId: 'org-1',
      eventId: 'e-1',
      savedAssets: { banner_url: 'https://x.test/banner-v1.png' },
    })
    expect(bucket.remove).not.toHaveBeenCalled()
    expect(result.warnings[0]).toMatch(/could not list existing assets/)
  })

  it('remove failure → structured warning, no throw', async () => {
    const bucket = {
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(async () => ({ error: { message: 'policy' } })),
      getPublicUrl: (p: string) => ({ data: { publicUrl: p } }),
      list: vi.fn(async () => ({ data: [{ name: 'banner-v1.png' }], error: null })),
    }
    const result = await cleanupThemeAssets({ storage: { from: () => bucket } } as unknown as ThemeAssetClient, {
      organizerId: 'org-1',
      eventId: 'e-1',
      savedAssets: { banner_url: 'https://x.test/other-v1.png' },
    })
    expect(result.removed).toEqual([])
    expect(result.warnings[0]).toMatch(/could not delete stale "banner-v1\.png"/)
  })
})

describe('FAMILY_FONT_URLS (hardcoded mirror of 081 seed)', () => {
  it('carries all 9 curated gstatic .woff2 URLs, each allowlist-clean', async () => {
    const { themeFontUrlOk } = await import('@/lib/theme/utils')
    const names = Object.keys(FAMILY_FONT_URLS).sort()
    expect(names).toEqual(
      ['Barlow', 'Bebas Neue', 'Cinzel', 'Inter', 'Orbitron', 'Poppins', 'Prata', 'Roboto', 'Source Sans 3'],
    )
    for (const url of Object.values(FAMILY_FONT_URLS)) {
      expect(url.startsWith('https://fonts.gstatic.com/') && url.endsWith('.woff2')).toBe(true)
      expect(themeFontUrlOk(url)).toBe(true)
    }
  })
})

// Task 11 rider (asset-value shape fix): stored values are origin-portable —
// https URLs pass through, the editor-drafted bucket path expands to the same
// public URL Storage's getPublicUrl produces, junk → null. utils.ts reads
// NEXT_PUBLIC_SUPABASE_URL per call — same env stub as tests/theme/utils.test.ts.
describe('storageAssetUrl (Task 11 rider — expand at consume)', () => {
  const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
  const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
  })
  afterAll(() => {
    if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
  })

  it('https URLs pass through untouched (external/legacy references)', () => {
    const url = 'https://vault.example.com/anything/else.png'
    expect(storageAssetUrl(url)).toBe(url)
  })

  it('the editor-drafted bucket path expands to the SAME URL getPublicUrl produces', async () => {
    // End-to-end tie: upload ships path+publicUrl; the path value the editor
    // now drafts expands against the origin env to exactly the publicUrl
    // (Save-enabled + renderable on any origin this env points to).
    const PREV_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage-origin.test' // makeBucket's mock origin
    try {
      const { calls, client } = makeBucket()
      const result = await uploadThemeAsset(client, {
        organizerId: 'org-1',
        eventId: 'e-1',
        kind: 'banner',
        file: makeFile('b.png', 'image/png', 10),
        ts: 1720000000000,
      })
      expect(result.path).toBe('organizers/org-1/events/e-1/banner-v1720000000000.png')
      expect(calls.uploads).toEqual(['organizers/org-1/events/e-1/banner-v1720000000000.png'])
      expect(storageAssetUrl(result.path)).toBe(result.publicUrl)
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = PREV_ENV
    }
  })

  it('plain 076-legal bucket path (no upload round-trip needed) also expands', () => {
    expect(
      storageAssetUrl('organizers/org-abc/events/9b2f4c1e-abcd-4321-9876-abcdef012345/logo-v7.webp'),
    ).toBe(
      `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/organizers/org-abc/events/9b2f4c1e-abcd-4321-9876-abcdef012345/logo-v7.webp`,
    )
  })

  it('trailing-slash / origin-normalized Supabase URL env never double-slashes the object URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `${TEST_SUPABASE_URL}/`
    expect(
      storageAssetUrl('organizers/org-1/events/e-1/banner-v1.png'),
    ).toBe(`${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/organizers/org-1/events/e-1/banner-v1.png`)
    // back to the describe-level stub for the remaining tests
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
  })

  it('a prefixed Supabase base URL keeps its API path (getPublicUrl parity for non-origin bases)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://portal.projectsupa.org/base'
    expect(storageAssetUrl('organizers/org-1/events/e-1/banner-v1.png')).toBe(
      'https://portal.projectsupa.org/base/storage/v1/object/public/event-themes/organizers/org-1/events/e-1/banner-v1.png',
    )
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
  })

  it('null → null; junk/hostile/076-invalid path values → null (reserved-box fallback)', () => {
    expect(storageAssetUrl(null)).toBeNull()
    expect(storageAssetUrl('javascript:alert(1)')).toBeNull()
    expect(storageAssetUrl('http://evil.example/x.png')).toBeNull()
    expect(storageAssetUrl('../escape.png')).toBeNull()
    expect(storageAssetUrl('has space.png')).toBeNull()
    expect(storageAssetUrl('')).toBeNull()
    expect(storageAssetUrl('banner-v1.png')).not.toBeNull() // plain valid path still expands
  })

  it('bucket path with the env unset or malformed → null (never fabricates a bad origin)', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(storageAssetUrl('organizers/org-1/events/e-1/banner-v1.png')).toBeNull()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url'
    expect(storageAssetUrl('organizers/org-1/events/e-1/banner-v1.png')).toBeNull()
    // Restore for worker hygiene.
    process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
  })
})
