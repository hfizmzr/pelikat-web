import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Reliability: single-tier organizer subscription pricing.
 *
 * The price lives in platform_settings (key organizer_subscription_price,
 * seeded by migration 073) and is read request-time. The HitPay
 * subscription checkout must ALWAYS post the DB-configured price — the
 * caller-supplied amount (previously the only unvalidated client-supplied
 * money, per the Reliability report) is gone; the function snaps the price
 * server-side before POSTing order_type=organizer_subscription.
 */

const { fetchDjangoApi, requireAuth } = vi.hoisted(() => ({
  fetchDjangoApi: vi.fn(),
  requireAuth: vi.fn(),
}))

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}

vi.mock('@/lib/django', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/django')>()
  return { ...actual, fetchDjangoApi }
})
vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))
// jsdom test env is not a server runtime — neutralize the server-only guard.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => mockSupabase) })

)

const SEEDED = { amount: 99, currency: 'MYR', period: 'year', duration_days: 365 }

const ORGANIZER_USER = {
  id: 'user-org',
  app_metadata: { organizer_id: 'org-1' },
}

const ORGANIZER = { id: 'org-1', name: 'Klub Lari KL', contact_email: 'org@example.com' }

const DJANGO_CREATE = {
  provider_request_id: 'pr-sub-1',
  checkout_url: 'https://sandbox.hit-pay.com/checkout/sub',
  qr_code: null,
  direct_link_url: null,
  status: 'pending',
}

// Table-addressed fake DB: from(table) returns data through the terminal
// method that action actually calls (single for organizers, maybeSingle
// for platform_settings).
const db: Record<string, unknown> = {
  organizers: ORGANIZER,
  platform_settings: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  db.organizers = ORGANIZER
  db.platform_settings = null
  requireAuth.mockResolvedValue({ supabase: mockSupabase, user: ORGANIZER_USER })
  mockSupabase.from.mockImplementation((table: string) => {
    const data = db[table]
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data, error: data ? null : { message: 'row not found' } })),
      maybeSingle: vi.fn(async () => ({ data, error: null })),
    }
  })
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.NEXT_PUBLIC_TUNNEL_URL
})

import {
  getOrganizerSubscriptionPrice,
  formatMYR,
  DEFAULT_ORGANIZER_SUBSCRIPTION_PRICE,
} from '@/lib/subscription'
import { createHitpaySubscriptionCheckout } from '@/components/events/actions'

function settingsRow(value: unknown) {
  db.platform_settings = value ? { value } : null
}

describe('Reliability: getOrganizerSubscriptionPrice', () => {
  it('returns the DB-configured price when the settings row is present', async () => {
    settingsRow({ amount: 149.5, currency: 'MYR', period: 'year', duration_days: 300 })
    const price = await getOrganizerSubscriptionPrice(mockSupabase)
    expect(price).toEqual({ amount: 149.5, currency: 'MYR', period: 'year', durationDays: 300 })
  })

  it('falls back to the seeded defaults when the row is missing', async () => {
    settingsRow(null)
    const price = await getOrganizerSubscriptionPrice(mockSupabase)
    expect(price).toEqual({ amount: 99, currency: 'MYR', period: 'year', durationDays: 365 })
  })

  it('falls back to the seeded defaults when the row is malformed (no/garbage amount)', async () => {
    for (const bad of [{ amount: 0 }, { amount: 'abc' }, { currency: 'MYR' }, 'garbage', undefined]) {
      settingsRow(bad)
      expect(await getOrganizerSubscriptionPrice(mockSupabase)).toEqual(
        DEFAULT_ORGANIZER_SUBSCRIPTION_PRICE
      )
    }
  })

  it('falls back to the seeded defaults when the query itself errors', async () => {
    mockSupabase.from.mockImplementation(() => {
      throw new Error('RLS denied')
    })
    expect(await getOrganizerSubscriptionPrice(mockSupabase)).toEqual(
      DEFAULT_ORGANIZER_SUBSCRIPTION_PRICE
    )
  })

  it('formatMYR keeps the MYR decimal convention (never sen integers)', () => {
    expect(formatMYR(99)).toBe('RM 99.00')
    expect(formatMYR(149.5)).toBe('RM 149.50')
  })
})

describe('Reliability: createHitpaySubscriptionCheckout posts the DB price', () => {
  it('ignores any caller-supplied amount and posts the configured price', async () => {
    settingsRow(SEEDED)
    fetchDjangoApi.mockResolvedValue(DJANGO_CREATE)
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'

    // The signature no longer accepts an amount; passing one is ignored.
    const result = await (createHitpaySubscriptionCheckout as (a?: number) => Promise<unknown>)(
      0.01
    )

    expect(result).toMatchObject({ ok: true, checkoutUrl: DJANGO_CREATE.checkout_url })
    const [endpoint, options] = fetchDjangoApi.mock.calls[0]
    expect(endpoint).toBe('/payments/create')
    const payload = JSON.parse(options.body)
    expect(payload.order_type).toBe('organizer_subscription')
    expect(payload.amount).toBe(99)
    expect(payload.redirect_url).toBe('https://app.example.com/organizer/payment')
  })

  it('posts the updated admin price immediately after an admin changes the setting', async () => {
    settingsRow({ ...SEEDED, amount: 129 })
    fetchDjangoApi.mockResolvedValue(DJANGO_CREATE)
    await createHitpaySubscriptionCheckout()
    const payload = JSON.parse(fetchDjangoApi.mock.calls[0][1].body)
    expect(payload.amount).toBe(129)
  })

  it('still posts the seeded price when the settings row is missing (fallback)', async () => {
    settingsRow(null)
    fetchDjangoApi.mockResolvedValue(DJANGO_CREATE)
    await createHitpaySubscriptionCheckout()
    expect(JSON.parse(fetchDjangoApi.mock.calls[0][1].body).amount).toBe(99)
  })
})
