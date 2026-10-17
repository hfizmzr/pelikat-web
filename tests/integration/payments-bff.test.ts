import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Module mocks ─────────────────────────────────────────────
const { fetchDjangoApi, requireAuth } = vi.hoisted(() => ({
  fetchDjangoApi: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/django', () => ({ fetchDjangoApi }))
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

// ── Subjects under test ──────────────────────────────────────
import { POST as createPOST } from '@/app/api/payments/create/route'
import { GET as statusGET } from '@/app/api/payments/status/route'
import { POST as refundPOST } from '@/app/api/payments/refund/route'
import { createHitpayCheckout } from '@/components/events/actions'
import { getPaymentProvider, getServerPaymentProvider } from '@/lib/payments'

const here = dirname(fileURLToPath(import.meta.url))
const read = (...parts: string[]) =>
  readFileSync(join(here, '..', '..', ...parts), 'utf-8')

const RUNNER_USER = { id: 'user-1' }

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
  describe('POST /api/payments/create', () => {
    it('forwards reference_number=registrationId and server-read amount to Django', async () => {
      singleRow('registrations', REGISTRATION)
      fetchDjangoApi.mockResolvedValue(DJANGO_CREATE)

      const response = await createPOST(
        new Request('http://localhost/api/payments/create', {
          method: 'POST',
          body: JSON.stringify({
            registrationId: 'reg-uuid-1',
            email: 'runner@example.com',
            name: 'Runner One',
          }),
        })
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.provider_request_id).toBe('pr-1')
      expect(body.checkout_url).toContain('hit-pay')

      expect(fetchDjangoApi).toHaveBeenCalledTimes(1)
      const [endpoint, options] = fetchDjangoApi.mock.calls[0]
      expect(endpoint).toBe('/payments/create')
      const payload = JSON.parse(options.body)
      expect(payload.reference_number).toBe('reg-uuid-1')
      expect(payload.registration_id).toBe('reg-uuid-1')
      expect(payload.order_type).toBe('registration')
      // amount comes from race_categories.price server-side, not the client
      expect(payload.amount).toBe(50)
    })

    it('rejects unauthenticated callers before touching Django', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })
      const response = await createPOST(
        new Request('http://localhost/api/payments/create', {
          method: 'POST',
          body: JSON.stringify({ registrationId: 'reg-uuid-1' }),
        })
      )
      expect(response.status).toBe(401)
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })

    it('404s when the registration does not exist (RLS-scoped)', async () => {
      singleRow('registrations', null)
      const response = await createPOST(
        new Request('http://localhost/api/payments/create', {
          method: 'POST',
          body: JSON.stringify({
            registrationId: 'someone-elses',
            email: 'x@example.com',
            name: 'X',
          }),
        })
      )
      expect(response.status).toBe(404)
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/payments/status', () => {
    it('test_redirect_params_never_confirm: ?status=completed alone never marks paid', async () => {
      singleRow('registrations', REGISTRATION)
      // Django knows the truth: still pending.
      fetchDjangoApi.mockResolvedValue({
        status: 'pending',
        payment_rail: null,
        provider_request_id: 'pr-1',
      })

      const response = await statusGET(
        new Request(
          'http://localhost/api/payments/status?registrationId=reg-uuid-1&status=completed'
        )
      )
      const body = await response.json()

      expect(body.status).toBe('pending')
      expect(body.status).not.toBe('paid')
      expect(body.status).not.toBe('completed')

      // Only reference_number is forwarded — the spoofable query param is not.
      const [endpoint] = fetchDjangoApi.mock.calls[0]
      expect(endpoint).toBe('/payments/status?reference_number=reg-uuid-1')
      expect(endpoint).not.toContain('status=completed')
    })

    it('404s for a registration the caller does not own', async () => {
      singleRow('registrations', null)
      const response = await statusGET(
        new Request('http://localhost/api/payments/status?registrationId=nope')
      )
      expect(response.status).toBe(404)
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/payments/refund', () => {
    it('forwards the refund for a payment the organizer owns (RLS-scoped)', async () => {
      singleRow('payments', { id: 'pay-row-1' })
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

    it('403s when RLS hides the payment (not the organizer\'s)', async () => {
      singleRow('payments', null)
      const response = await refundPOST(
        new Request('http://localhost/api/payments/refund', {
          method: 'POST',
          body: JSON.stringify({ provider_request_id: 'pr-other' }),
        })
      )
      expect(response.status).toBe(403)
      expect(fetchDjangoApi).not.toHaveBeenCalled()
    })
  })

  describe('createHitpayCheckout server action', () => {
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

    it('throws (never returns a fake checkout) when Django rejects', async () => {
      singleRow('registrations', REGISTRATION)
      fetchDjangoApi.mockRejectedValue(
        new Error('Django API error: Amount mismatch')
      )
      await expect(
        createHitpayCheckout({
          registrationId: 'reg-uuid-1',
          email: 'runner@example.com',
          name: 'Runner One',
        })
      ).rejects.toThrow(/Amount mismatch/)
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
    it('no payments BFF route or action marks anything paid from query params', () => {
      const routeFiles = [
        'src/app/api/payments/create/route.ts',
        'src/app/api/payments/status/route.ts',
        'src/app/api/payments/refund/route.ts',
      ]
      for (const file of routeFiles) {
        const content = read(file)
        expect(content).not.toContain("payment_status: 'paid'")
        expect(content).not.toContain("status: 'paid'")
        expect(content).not.toContain('confirm_dummy_payment')
        expect(content).not.toContain("'confirm_payment'")
      }
    })
  })
})
