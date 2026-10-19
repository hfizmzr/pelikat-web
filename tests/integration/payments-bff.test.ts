import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Module mocks ─────────────────────────────────────────────
const { fetchDjangoApi, requireAuth } = vi.hoisted(() => ({
  fetchDjangoApi: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/django', async (importOriginal) => {
  // Real module for DjangoApiError; only the network fn is stubbed.
  const actual = await importOriginal<typeof import('@/lib/django')>()
  return { ...actual, fetchDjangoApi }
})
vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabase),
}))
// confirmDummyPayment (re-exported from '@/lib/actions/payments') reaches for
// the service-role client per migration 060; stub it out for action tests.
vi.mock('@/lib/supabase/service-role', () => ({
  supabaseAdmin: { rpc: vi.fn() },
}))

// ── Subjects under test ─────────────────────────────────────────
// The former /api/payments/create and /api/payments/status BFF routes were
// dead duplicates of the server actions and have been deleted; refund
// remains the sole payments BFF route.
import { POST as refundPOST } from '@/app/api/payments/refund/route'
import { createHitpayCheckout } from '@/components/events/actions'
import { DjangoApiError } from '@/lib/django'
import { getPaymentProvider, getServerPaymentProvider } from '@/lib/payments'

const here = dirname(fileURLToPath(import.meta.url))
const read = (...parts: string[]) =>
  readFileSync(join(here, '..', '..', ...parts), 'utf-8')

const RUNNER_USER = { id: 'user-1', app_metadata: {} }
const ORGANIZER_USER = {
  id: 'user-org',
  app_metadata: { organizer_id: 'org-1' },
}

function maybeRow(table: string, data: unknown) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  }
  mockSupabase.from.mockImplementation((t: string) => {
    expect(t).toBe(table)
    return builder
  })
  return builder
}

function singleRow(table: string, data: unknown) {
  mockSupabase.from.mockImplementation((t: string) => {
    expect(t).toBe(table)
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({
        data,
        error: data ? null : { message: 'row not found' },
      })),
    }
  })
}

const REGISTRATION = {
  id: 'reg-uuid-1',
  event_id: 'event-uuid-1',
  runner_id: 'runner-uuid-1',
  payment_status: 'pending',
  race_categories: { price: 50 },
}

const DJANGO_CREATE = {
  provider_request_id: 'pr-1',
  checkout_url: 'https://sandbox.hit-pay.com/checkout/x',
  qr_code: null,
  direct_link_url: null,
  status: 'pending',
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuth.mockResolvedValue({ supabase: mockSupabase, user: RUNNER_USER })
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: RUNNER_USER },
  })
})

afterEach(() => {
  delete process.env.PAYMENT_PROVIDER
  delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.NEXT_PUBLIC_TUNNEL_URL
})

describe('Integration: Payments BFF (Task 3)', () => {
  describe('POST /api/payments/refund', () => {
    it('forwards the refund for a payment whose organizer_id matches the caller (app-enforced, CWE-285)', async () => {
      requireAuth.mockResolvedValue({
        supabase: mockSupabase,
        user: ORGANIZER_USER,
      })
      maybeRow('payments', { id: 'pay-row-1' })
      fetchDjangoApi.mockResolvedValue({ status: 'refunded' })

      const response = await refundPOST(
        new Request('http://localhost/api/payments/refund', {
          method: 'POST',
          body: JSON.stringify({ provider_request_id: 'pr-1' }),
        })
      )
      expect(response.status).toBe(200)
      const [endpoint, options] = fetchDjangoApi.mock.calls[0]
      expect(endpoint).toBe('/payments/refund')
      expect(JSON.parse(options.body).provider_request_id).toBe('pr-1')
    })

    it('403s a paying runner even with a valid provider_request_id', async () => {
      // RUNNER_USER has no app_metadata.organizer_id — the explicit
      // organizer gate must short-circuit before any Django call.
      requireAuth.mockResolvedValue({
        supabase: mockSupabase,
        user: RUNNER_USER,
      })
      fetchDjangoApi.mockClear()
      const response = await refundPOST(
        new Request('http://localhost/api/payments/refund', {
          method: 'POST',
          body: JSON.stringify({ provider_request_id: 'pr-runner-owns' }),
        })
      )
      expect(response.status).toBe(403)
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })

    it('403s an organizer whose organizer_id does not own the payment (explicit eq filter)', async () => {
      requireAuth.mockResolvedValue({
        supabase: mockSupabase,
        user: ORGANIZER_USER,
      })
      const builder = maybeRow('payments', null)
      const response = await refundPOST(
        new Request('http://localhost/api/payments/refund', {
          method: 'POST',
          body: JSON.stringify({ provider_request_id: 'pr-other' }),
        })
      )
      expect(response.status).toBe(403)
      expect(fetchDjangoApi).not.toHaveBeenCalled()
      // Ownership filter is app-enforced, not just RLS.
      const eqArgs = builder.eq?.mock?.calls ?? []
      expect(eqArgs).toContainEqual(['organizer_id', 'org-1'])
    })

    it('400s a non-positive / non-finite client amount', async () => {
      requireAuth.mockResolvedValue({
        supabase: mockSupabase,
        user: ORGANIZER_USER,
      })
      maybeRow('payments', { id: 'pay-row-1' })
      for (const bad of [0, -3.5, 'abc', 'NaN', Number.POSITIVE_INFINITY]) {
        const response = await refundPOST(
          new Request('http://localhost/api/payments/refund', {
            method: 'POST',
            body: JSON.stringify({ provider_request_id: 'pr-1', amount: bad }),
          })
        )
        expect(response.status).toBe(400)
      }
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })

    it('400s when provider_request_id is missing', async () => {
      requireAuth.mockResolvedValue({
        supabase: mockSupabase,
        user: ORGANIZER_USER,
      })
      const response = await refundPOST(
        new Request('http://localhost/api/payments/refund', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      )
      expect(response.status).toBe(400)
    })
  })

  describe('createHitpayCheckout server action', () => {
    it('returns alreadyPaid for a paid registration without calling Django', async () => {
      singleRow('registrations', { ...REGISTRATION, payment_status: 'paid' })
      const result = await createHitpayCheckout({
        registrationId: 'reg-uuid-1',
        email: 'runner@example.com',
        name: 'Runner One',
      })
      expect(result).toEqual({ ok: true, alreadyPaid: true })
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })

    it('rejects a zero/missing category price before Django is called', async () => {
      singleRow('registrations', { ...REGISTRATION, race_categories: { price: 0 } })
      const result = await createHitpayCheckout({
        registrationId: 'reg-uuid-1',
        email: 'runner@example.com',
        name: 'Runner One',
      })
      expect(result.ok).toBe(false)
      expect((result as { error: string }).error).toMatch(/registration fee/i)
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })

    it('builds the Django payload with amount snapshot and app redirect_url', async () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
      singleRow('registrations', REGISTRATION)
      fetchDjangoApi.mockResolvedValue(DJANGO_CREATE)

      const result = await createHitpayCheckout({
        registrationId: 'reg-uuid-1',
        email: 'runner@example.com',
        name: 'Runner One',
      })

      expect(result).toEqual({
        ok: true,
        checkoutUrl: DJANGO_CREATE.checkout_url,
        qrCode: null,
        providerRequestId: 'pr-1',
      })

      const [endpoint, options] = fetchDjangoApi.mock.calls[0]
      expect(endpoint).toBe('/payments/create')
      const payload = JSON.parse(options.body)
      expect(payload.reference_number).toBe('reg-uuid-1')
      expect(payload.amount).toBe(50)
      expect(payload.redirect_url).toBe(
        'https://app.example.com/runner/events/event-uuid-1/payment'
      )
    })

    it('returns a clean error result (never throws) when Django rejects', async () => {
      singleRow('registrations', REGISTRATION)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchDjangoApi.mockRejectedValue(
        new Error('Django API error: Amount mismatch')
      )
      const result = await createHitpayCheckout({
        registrationId: 'reg-uuid-1',
        email: 'runner@example.com',
        name: 'Runner One',
      })
      expect(result).toEqual({
        ok: false,
        error: 'Could not start the payment. Please try again or contact support.',
      })
      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('maps a HitPay 422 payment-method rejection to a runner-friendly error', async () => {
      singleRow('registrations', REGISTRATION)
      fetchDjangoApi.mockRejectedValue(
        new DjangoApiError(
          'Django API error: The selected payment method (fpx) is unavailable for your account or the currency is invalid'
        )
      )
      const result = await createHitpayCheckout({
        registrationId: 'reg-uuid-1',
        email: 'runner@example.com',
        name: 'Runner One',
      })
      expect(result).toEqual({
        ok: false,
        error: 'Payment methods are temporarily unavailable. Please try again shortly or contact support.',
      })
    })
  })

  describe('provider gate', () => {
    it("accepts 'hitpay' alongside 'mock'", () => {
      process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = 'hitpay'
      expect(getPaymentProvider()).toBe('hitpay')
    })

    it('still defaults to mock and throws for unknown providers', () => {
      delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER
      expect(getPaymentProvider()).toBe('mock')
      process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = 'stripe'
      expect(() => getPaymentProvider()).toThrow(/not implemented yet/)
    })

    it('server gate reads PAYMENT_PROVIDER for server-side guards', () => {
      process.env.PAYMENT_PROVIDER = 'hitpay'
      expect(getServerPaymentProvider()).toBe('hitpay')
      process.env.PAYMENT_PROVIDER = 'stripe'
      expect(() => getServerPaymentProvider()).toThrow(/not implemented yet/)
    })
  })

  describe('redirect trust (source-level)', () => {
    it('test_redirect_params_never_confirm: the actions layer never confirms payment from URL params', () => {
      // The old BFF status route is gone; its semantics move to the
      // actions layer: no server action parses URL/query params, and the
      // only "paid" write is the provider-guarded dummy-confirm RPC.
      const paymentActions = read('src', 'lib', 'actions', 'payments.ts')
      expect(paymentActions).not.toMatch(/searchParams|request\.url|new URL\(/i)
      expect(paymentActions).toContain('confirm_dummy_payment')
      expect(paymentActions).toContain("getServerPaymentProvider() !== 'mock'")
      expect(paymentActions).not.toContain("'status=completed'")
      expect(paymentActions).not.toContain('status=completed')

      const eventActions = read('src', 'components', 'events', 'actions.ts')
      expect(eventActions).not.toMatch(/searchParams|request\.url/i)
      expect(eventActions).not.toContain("payment_status: 'paid'")

      // Redirect params on the payment page are display-only hints: they can
      // at most switch to the `awaiting` phase; confirmation comes only from
      // Realtime/poll of Django's webhook truth.
      const runnerPage = read(
        'src',
        'app',
        'runner',
        'events',
        '[id]',
        'payment',
        'page.tsx'
      )
      expect(runnerPage).toContain("urlParams.has('reference') || urlParams.has('status')")
      expect(runnerPage).toMatch(/NEVER trusted for state/)
      expect(runnerPage).not.toContain("payment_status: 'paid'")

      // Refund is the only remaining BFF route and never marks payments paid.
      const refundRoute = read('src', 'app', 'api', 'payments', 'refund', 'route.ts')
      expect(refundRoute).not.toContain("payment_status: 'paid'")
      expect(refundRoute).not.toContain("status: 'paid'")
      expect(refundRoute).not.toContain('confirm_dummy_payment')
      expect(refundRoute).not.toContain("'confirm_payment'")
    })
  })
})
