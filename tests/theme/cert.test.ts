import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// ── Module mocks (same pattern as tests/reliability/payments-action-ownership.test.ts) ──
const { fetchDjangoApi, requireAuth } = vi.hoisted(() => ({
  fetchDjangoApi: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/django', () => ({ fetchDjangoApi }))
vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))

import { generateBadgeCertificate, generateVirtualEventCertificate } from '@/lib/actions/cert'

// storageAssetUrl expands bucket paths against NEXT_PUBLIC_SUPABASE_URL —
// same env stub as tests/theme/assets.test.ts.
const RESTORED_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const TEST_SUPABASE_URL = 'https://test-supabase.example.co'
const CERT_BG_PREFIX = `${TEST_SUPABASE_URL}/storage/v1/object/public/event-themes/`
process.env.NEXT_PUBLIC_SUPABASE_URL = TEST_SUPABASE_URL
afterAll(() => {
  if (RESTORED_SUPABASE_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = RESTORED_SUPABASE_URL
})

const EVENT_ID = '00000000-0000-4000-8000-00000000000e'
const THEME_CONFIG = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017' },
  assets: {
    certificate_background_url: 'organizers/o1/events/e1/certificate_background-v1.png',
  },
  vocabulary: { bib_label: 'Nombor Larian', medal_label: 'Pingat' },
  meta: { version: 1 },
}
const EXPECTED_THEME = {
  colors: { primary: '#9C4A1A', secondary: '#3E2C23', accent: '#D4A017' },
  certificate_background_url: `${CERT_BG_PREFIX}organizers/o1/events/e1/certificate_background-v1.png`,
  labels: {
    bib: 'Nombor Larian',
    checkpoint: 'Checkpoint',
    medal: 'Pingat',
    run: 'Run',
    participant: 'Participant',
    certificate: 'Certificate',
  },
  layout: { name_plate: 'auto' },
}

/** Minimal chainable supabase mock — one data value per table, covering the
 * query shapes cert.ts (eq/is chains, single, maybeSingle, bare await) and
 * the theme resolver (theme_presets + get_event_theme RPC) use. */
function fakeClient(tables: Record<string, unknown>) {
  return {
    from: (table: string) => {
      const result = { data: tables[table] ?? null, error: null }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        single: () => chain,
        maybeSingle: () => chain,
        then: (res: unknown, rej: unknown) => Promise.resolve(result).then(res, rej),
      }
      return chain
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
}

const USER = { id: 'auth-user-1' }

function lastBody() {
  expect(fetchDjangoApi).toHaveBeenCalledTimes(1)
  const [path, init] = fetchDjangoApi.mock.calls[0]
  expect(path).toBe('/ai/ecert/generate')
  return JSON.parse(init.body)
}

describe('cert actions: additive theme payload (P4 Task 4)', () => {
  beforeEach(() => {
    fetchDjangoApi.mockReset()
    requireAuth.mockReset()
    fetchDjangoApi.mockResolvedValue({ cert_url: 'https://x/signed?token=1' })
  })

  describe('virtual path', () => {
    function seedVirtual(themeRow: { theme_preset_id?: string | null; theme_config?: unknown } = {}) {
      requireAuth.mockResolvedValue({
        supabase: fakeClient({
          events: {
            name: 'Mega Run 2026',
            event_type: 'virtual',
            target_distance_km: 5,
            theme_preset_id: null,
            theme_config: null,
            ...themeRow,
          },
          runner_profiles: { id: 'runner-1', full_name: 'Abu Bin Ali' },
          registrations: { payment_status: 'paid' },
          run_logs: [{ distance_km: 6 }],
        }),
        user: USER,
      })
    }

    it('themed event → exact theme block with expanded https background + short labels + legacy keys intact', async () => {
      seedVirtual({ theme_preset_id: null, theme_config: THEME_CONFIG })
      await generateVirtualEventCertificate({ eventId: EVENT_ID })
      const body = lastBody()
      expect(body.theme).toEqual(EXPECTED_THEME)
      // Legacy keys untouched.
      expect(body.runner_name).toBe('Abu Bin Ali')
      expect(body.event_name).toBe('Mega Run 2026')
      expect(body.bib_number).toBe('—') // neutral filler survives with theme
      expect(body.event_date).toBe(new Date().toISOString().slice(0, 10))
      // registration_id format unchanged: virtual_{event slice 8}_{profile slice 8}
      expect(body.registration_id).toBe('virtual_00000000_runner-1')
      expect(Object.keys(body).sort()).toEqual(
        ['bib_number', 'event_date', 'event_name', 'registration_id', 'runner_name', 'theme'].sort()
      )
    })

    it('unthemed event (no preset id, no config) → NO theme key, legacy shape preserved', async () => {
      seedVirtual()
      await generateVirtualEventCertificate({ eventId: EVENT_ID })
      const body = lastBody()
      expect('theme' in body).toBe(false)
      expect(Object.keys(body).sort()).toEqual(
        ['bib_number', 'event_date', 'event_name', 'registration_id', 'runner_name'].sort()
      )
    })

    it('preset-resolved event (RLS-hidden preset row → RPC fallback) → theme present', async () => {
      const presetClient = fakeClient({
        events: {
          name: 'Mega Run 2026',
          event_type: 'virtual',
          target_distance_km: 5,
          theme_preset_id: '11111111-1111-1111-1111-111111111111',
          theme_config: null,
        },
        runner_profiles: { id: 'runner-1', full_name: 'Abu Bin Ali' },
        registrations: { payment_status: 'paid' },
        run_logs: [{ distance_km: 6 }],
        theme_presets: null,
      })
      ;(presetClient as { rpc: () => Promise<unknown> }).rpc = () =>
        Promise.resolve({
          data: { ...THEME_CONFIG },
          error: null,
        })
      requireAuth.mockResolvedValue({ supabase: presetClient, user: USER })
      await generateVirtualEventCertificate({ eventId: EVENT_ID })
      const body = lastBody()
      expect(body.theme).toEqual(EXPECTED_THEME)
    })

    it('malformed asset value → certificate_background_url key omitted (never null), colors kept', async () => {
      seedVirtual({
        theme_config: {
          ...THEME_CONFIG,
          assets: { certificate_background_url: 'not a valid asset value' },
        },
      })
      await generateVirtualEventCertificate({ eventId: EVENT_ID })
      const body = lastBody()
      expect('certificate_background_url' in body.theme).toBe(false)
      expect(body.theme.colors).toEqual(EXPECTED_THEME.colors)
      expect(body.theme.labels).toEqual(EXPECTED_THEME.labels)
      expect(body.theme.layout).toEqual(EXPECTED_THEME.layout)
    })

    it('contrast-degraded color slot → that color omitted, kept colors intact', async () => {
      seedVirtual({
        theme_config: {
          ...THEME_CONFIG,
          // #777777's foreground companion is 4.42:1 — below the resolver's
          // 4.5:1 gate, degrading it to the platform fill → not shipped.
          colors: { ...THEME_CONFIG.colors, accent: '#777777' },
        },
      })
      await generateVirtualEventCertificate({ eventId: EVENT_ID })
      const body = lastBody()
      expect('accent' in body.theme.colors).toBe(false)
      expect(body.theme.colors.primary).toBe('#9C4A1A')
      expect(body.theme.colors.secondary).toBe('#3E2C23')
    })
  })

  describe('badge path', () => {
    function seedBadge(themeRow: { theme_preset_id?: string | null; theme_config?: unknown } | null) {
      requireAuth.mockResolvedValue({
        supabase: fakeClient({
          runner_badges: { id: 'b1', awarded_at: '2026-10-29T00:00:00.000Z' },
          events: { name: 'Mega Run 2026', ...themeRow },
          registrations: { bib_number: 'A001' },
          runner_profiles_safe: { full_name: 'Abu Bin Ali' },
        }),
        user: USER,
      })
    }

    it('themed event → theme included (bib from registration, legacy keys intact)', async () => {
      seedBadge({ theme_preset_id: null, theme_config: THEME_CONFIG })
      await generateBadgeCertificate({
        runnerId: 'runner-1',
        badgeKey: 'first_finish',
        eventId: EVENT_ID,
        badgeName: 'Mega Run',
      })
      const body = lastBody()
      expect(body.theme).toEqual(EXPECTED_THEME)
      expect(body.bib_number).toBe('A001')
      expect(body.event_name).toBe('Mega Run 2026')
      expect(Object.keys(body).sort()).toEqual(
        ['bib_number', 'event_date', 'event_name', 'registration_id', 'runner_name', 'theme'].sort()
      )
    })

    it('unthemed event → NO theme key, legacy shape preserved', async () => {
      seedBadge(null)
      await generateBadgeCertificate({
        runnerId: 'runner-1',
        badgeKey: 'first_finish',
        eventId: EVENT_ID,
        badgeName: 'Mega Run',
      })
      const body = lastBody()
      expect('theme' in body).toBe(false)
      expect(Object.keys(body).sort()).toEqual(
        ['bib_number', 'event_date', 'event_name', 'registration_id', 'runner_name'].sort()
      )
    })

    it('no eventId context → legacy payload (theme never included)', async () => {
      requireAuth.mockResolvedValue({
        supabase: fakeClient({
          runner_badges: { id: 'b1', awarded_at: '2026-10-29T00:00:00.000Z' },
          runner_profiles_safe: { full_name: 'Platform Runner' },
        }),
        user: USER,
      })
      await generateBadgeCertificate({
        runnerId: 'runner-1',
        badgeKey: 'early_bird',
        eventId: null,
        badgeName: 'Early Bird',
      })
      const body = lastBody()
      expect('theme' in body).toBe(false)
      expect(body.event_name).toBe('Early Bird')
      expect(body.bib_number).toBe('—')
    })
  })
})
