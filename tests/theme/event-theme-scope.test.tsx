import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { prerender } from 'react-dom/static'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { EventThemeScope } from '@/components/theme/event-theme-scope'

// EventThemeScope builds its own server client (plan interface: { event, children }).
// Mock the module so tests never touch next/headers; resolve.ts's only query is
// the theme_presets lookup — same minimal chainable fake as resolve.test.ts.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const EVENT_ID = '9b2f4c1e-abcd-4321-9876-abcdef012345'
const PRESET_ID = '11111111-1111-1111-1111-111111111111'

type PresetRow = { id: string; tokens: unknown } | null

function fakeSupabase(row: PresetRow): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

function useSupabase(row: PresetRow): void {
  vi.mocked(createClient).mockResolvedValue(
    fakeSupabase(row) as unknown as Awaited<ReturnType<typeof createClient>>,
  )
}

// Valid per the write validator (Task 1/9): strict HEX, contrast ≥3:1 vs the
// platform background, https + .woff2 heading font.
const TOKENS = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017', ring: '#C68B2E' },
  typography: { heading_font_url: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2' },
  meta: { version: 1 },
}

function event(theme_preset_id: string | null, theme_config: unknown = null) {
  return { id: EVENT_ID, theme_preset_id, theme_config }
}

// renderToStaticMarkup (react-dom/server) rejects async components in React
// 19; prerender (react-dom/static) is its async-capable counterpart and still
// yields the raw SSR string — inline vars pre-hydration are asserted verbatim.
async function render(
  event: { id: string; theme_preset_id: string | null; theme_config: unknown },
  showAssets?: boolean,
) {
  const { prelude } = await prerender(
    <EventThemeScope event={event} showAssets={showAssets}>
      <p>child</p>
    </EventThemeScope>,
  )
  let html = ''
  const reader = prelude.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value, { stream: true })
  }
  return html + decoder.decode()
}

// Task 11 rider: storageAssetUrl reads NEXT_PUBLIC_SUPABASE_URL per call —
// same env stub as tests/theme/utils.test.ts (vitest isolates workers per file).
const TEST_SUPABASE_URL = 'https://ugexrrslijmwtieevjbs.supabase.co'
const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
})
afterAll(() => {
  if (REAL_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL
})

// The 16 brand vars buildStyleVars emits — light/dark × color/companion-fg.
const ROLE_SUFFIXES = ['-fg', '-dark', '-fg-dark'] as const

// P3 Task 7: https asset values must sit on the platform storage origin
// (assetValueOk host pin — env stubbed to TEST_SUPABASE_URL above).
const ASSETS_CONFIG = {
  assets: {
    banner_url: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/banner-v1721000000000.png`,
    logo_url: `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/logo.png`,
  },
}

describe('EventThemeScope showAssets (Task 10: banner/logo rendering)', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('unthemed event + showAssets → children unwrapped exactly as without the prop', async () => {
    useSupabase(null)
    const html = await render(event(null), true)
    expect(html).toBe('<p>child</p>')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('default (no prop) + theme carrying assets → NO asset nodes (P1 DOM; leaderboard contract)', async () => {
    useSupabase({ id: PRESET_ID, tokens: { ...TOKENS, ...ASSETS_CONFIG } })
    const html = await render(event(PRESET_ID))
    expect(html).not.toContain('<img')
    expect(html).not.toContain('aspect-ratio')
    expect(html).toContain('child')
  })

  it('showAssets with NO resolved asset values → DOM byte-identical to the default render', async () => {
    useSupabase({ id: PRESET_ID, tokens: TOKENS })
    const baseline = await render(event(PRESET_ID))
    const html = await render(event(PRESET_ID), true)
    expect(html).toBe(baseline)
    expect(html).not.toContain('<img')
  })

  it('showAssets + resolved banner + logo → banner (3/1) above children + logo (1/1) overlay', async () => {
    useSupabase({ id: PRESET_ID, tokens: { ...TOKENS, ...ASSETS_CONFIG } })
    const html = await render(event(PRESET_ID), true)
    // Banner: leading section, reserved 3/1 box with the real img src.
    expect(html).toContain('aspect-ratio:3/1')
    expect(html).toContain(`<img src="${ASSETS_CONFIG.assets.banner_url}"`)
    // Logo: 1/1 box, width-capped w-16, real img src (ER: "synthetic banner
    // value → banner img src present"; logo mirrors the same contract).
    expect(html).toContain('aspect-ratio:1/1')
    expect(html).toContain('w-16')
    expect(html).toContain(`<img src="${ASSETS_CONFIG.assets.logo_url}"`)
    // Children still render after the asset nodes.
    expect(html.indexOf('aspect-ratio:3/1')).toBeLessThan(html.indexOf('child'))
  })

  it('showAssets + banner only / logo only → each renders its OWN slot only', async () => {
    useSupabase({
      id: PRESET_ID,
      tokens: { ...TOKENS, assets: { banner_url: ASSETS_CONFIG.assets.banner_url } },
    })
    const bannerOnly = await render(event(PRESET_ID), true)
    expect(bannerOnly).toContain(`<img src="${ASSETS_CONFIG.assets.banner_url}"`)
    expect(bannerOnly).not.toContain(ASSETS_CONFIG.assets.logo_url)

    useSupabase({
      id: PRESET_ID,
      tokens: { ...TOKENS, assets: { logo_url: ASSETS_CONFIG.assets.logo_url } },
    })
    const logoOnly = await render(event(PRESET_ID), true)
    expect(logoOnly).toContain(`<img src="${ASSETS_CONFIG.assets.logo_url}"`)
    expect(logoOnly).not.toContain('aspect-ratio:3/1')
  })

  it('showAssets + hostile asset value → resolve degrades: no img, P1 DOM preserved', async () => {
    useSupabase({
      id: PRESET_ID,
      tokens: { ...TOKENS, assets: { banner_url: 'javascript:alert(1)' } },
    })
    const baseline = await render(event(PRESET_ID))
    const html = await render(event(PRESET_ID), true)
    expect(html).toBe(baseline)
  })

  it('Task 11 rider: 076-legal bucket-path asset → <img src> is the EXPANDED Storage URL, raw path never renders', async () => {
    const bannerPath = 'organizers/org-1/events/e-1/banner-v1720000000000.png'
    const logoPath = 'organizers/org-1/events/e-1/logo-v1720000000001.png'
    useSupabase({
      id: PRESET_ID,
      tokens: { ...TOKENS, assets: { banner_url: bannerPath, logo_url: logoPath } },
    })
    const html = await render(event(PRESET_ID), true)
    const expandedBanner = `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/${bannerPath}`
    const expandedLogo = `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/${logoPath}`
    expect(html).toContain(`<img src="${expandedBanner}"`)
    expect(html).toContain(`<img src="${expandedLogo}"`)
    expect(html).not.toContain(`<img src="organizers/`)
    expect(html).toContain('aspect-ratio:3/1')
    expect(html).toContain('aspect-ratio:1/1')
  })
})

describe('EventThemeScope (SSR, spec §5.3)', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('themed event → wrapper div carries both color modes inline, pre-hydration', async () => {
    useSupabase({ id: PRESET_ID, tokens: TOKENS })
    const html = await render(event(PRESET_ID))
    expect(html).toContain('class="event-theme"')
    for (const role of ['primary', 'secondary', 'accent', 'ring']) {
      // Color slots are always oklch; -fg companions may be HEX (#ffffff) —
      // presence of the pair is the zero-FOUC contract, not its unit.
      expect(html).toContain(`--et-${role}:oklch(`)
      for (const suffix of ROLE_SUFFIXES) {
        expect(html).toContain(`--et-${role}${suffix}:`)
      }
    }
    expect(html).toContain('child')
  })

  it('unthemed event → children unwrapped (no wrapper, no font-face, no query)', async () => {
    useSupabase(null)
    const html = await render(event(null))
    expect(html).toBe('<p>child</p>')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('empty theme_config object → treated as unthemed', async () => {
    useSupabase(null)
    const html = await render(event(null, {}))
    expect(html).toBe('<p>child</p>')
  })

  it('theme_config-only event (no preset) → still wrapped', async () => {
    useSupabase(null)
    const html = await render(event(null, { colors: { primary: '#123456' } }))
    expect(html).toContain('class="event-theme"')
    expect(html).toContain('--et-primary:oklch(')
  })

  it('preset lookup fails → platform theme still wraps (resolve degrades, never throws)', async () => {
    useSupabase(null)
    const html = await render(event(PRESET_ID))
    expect(html).toContain('class="event-theme"')
    // Platform primary (resolve.ts PLATFORM_SLOTS, mirrors globals.css).
    expect(html).toContain('--et-primary:oklch(0.51 0.16 190)')
  })

  it('themed heading font → @font-face + font var with system-generated family', async () => {
    useSupabase({ id: PRESET_ID, tokens: TOKENS })
    const html = await render(event(PRESET_ID))
    expect(html).toContain('@font-face')
    expect(html).toContain('font-family: ET-9b2f4c1e-Heading;')
    // Binding carry (Task 10): font vars only emit when event.id is passed.
    expect(html).toContain('--et-font-heading:ET-9b2f4c1e-Heading')
    // Body slot unset → no body face, no body var (Geist = platform behavior).
    expect(html).not.toContain('ET-9b2f4c1e-Body')
    expect(html).not.toContain('--et-font-body')
  })

  it('both font slots set → both @font-faces + both vars with system families', async () => {
    useSupabase({
      id: PRESET_ID,
      tokens: {
        ...TOKENS,
        typography: {
          heading_font_url: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2',
          body_font_url: 'https://fonts.gstatic.com/s/inter/v1/y.woff2',
        },
      },
    })
    const html = await render(event(PRESET_ID))
    expect(html.match(/@font-face/g)).toHaveLength(2)
    expect(html).toContain('font-family: ET-9b2f4c1e-Heading;')
    expect(html).toContain('font-family: ET-9b2f4c1e-Body;')
    expect(html).toContain('--et-font-heading:ET-9b2f4c1e-Heading')
    expect(html).toContain('--et-font-body:ET-9b2f4c1e-Body')
  })

  it('font slot URL failing the allowlist (heading scope) → no @font-face (Geist fallback)', async () => {
    useSupabase({
      id: PRESET_ID,
      tokens: { ...TOKENS, typography: { heading_font_url: 'http://evil.example/x.woff2' } },
    })
    const html = await render(event(PRESET_ID))
    expect(html).not.toContain('@font-face')
    expect(html).not.toContain('--et-font-heading')
    expect(html).toContain('class="event-theme"')
  })

  it('hostile body slot URL → body face + var dropped, heading survives', async () => {
    useSupabase({
      id: PRESET_ID,
      tokens: {
        ...TOKENS,
        typography: {
          heading_font_url: 'https://fonts.gstatic.com/s/lasso/v1/x.woff2',
          body_font_url: 'https://evil.example.com/x.woff2',
        },
      },
    })
    const html = await render(event(PRESET_ID))
    expect(html).not.toContain('ET-9b2f4c1e-Body')
    expect(html).not.toContain('--et-font-body')
    expect(html).toContain('font-family: ET-9b2f4c1e-Heading;')
    expect(html).toContain('--et-font-heading:ET-9b2f4c1e-Heading')
    expect(html.match(/@font-face/g)).toHaveLength(1)
  })
})
