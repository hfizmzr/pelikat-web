import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  fetchDjangoApi: vi.fn(),
}))

const ORDER = { id: 'ord-1', order_number: 'MR-1', total_amount: 25, status: 'pending' }
const PROFILE = { id: 'p-1', full_name: 'Run Runner' }

vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => ({
    supabase: {
      rpc: h.rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            // profile queries use .single(), order queries .maybeSingle()
            single: async () => ({ data: PROFILE, error: null }),
            maybeSingle: async () => ({ data: ORDER, error: null }),
          }),
        }),
      }),
    },
    user: { id: 'u-1', email: 'runner@pelikat.test' },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/django', () => ({
  DjangoApiError: class MockDjangoApiError extends Error {
    readonly status: number
    constructor(message: string, errors?: unknown, status?: number) {
      super(message)
      this.name = 'DjangoApiError'
      this.errors = errors
      this.status = status ?? 0
    }
  },
  fetchDjangoApi: h.fetchDjangoApi,
}))

import { startMerchCheckout, resumeMerchCheckout } from '@/components/merch/store-actions'

const checkoutInput = {
  eventId: 'evt-1',
  items: [{ variantId: 'v-1', quantity: 1 }],
  method: 'fpx' as const,
}

beforeEach(() => {
  h.rpc.mockReset()
  h.fetchDjangoApi.mockReset()
  h.rpc.mockResolvedValue({
    data: [{ order_id: ORDER.id, order_number: ORDER.order_number, total_amount: ORDER.total_amount }],
    error: null,
  })
})

describe('merch checkout: /payments/create failure keeps the reserved order', () => {
  it('surfaces the reserved orderId, then the retry resumes THAT order (no new merch_checkout)', async () => {
    h.fetchDjangoApi.mockRejectedValue(new Error('gateway down'))

    const failed = await startMerchCheckout(checkoutInput)
    expect(failed.ok).toBe(false)
    expect(failed.error).toBeTruthy()
    // the pending order merch_checkout reserved is still surfaced
    expect(failed.orderId).toBe(ORDER.id)
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.fetchDjangoApi).toHaveBeenCalledTimes(1)

    // retry path: the client resumes the SAME order — startMerchCheckout
    // (the only rpc caller) is never invoked again.
    h.fetchDjangoApi.mockResolvedValue({ checkout_url: 'https://pay.hitpay.pelikat.test/merch' })
    const resumed = await resumeMerchCheckout(failed.orderId!)
    expect(resumed).toMatchObject({ ok: true, data: { checkoutUrl: 'https://pay.hitpay.pelikat.test/merch' } })
    expect(h.rpc).toHaveBeenCalledTimes(1)
    const [endpoint, init] = h.fetchDjangoApi.mock.calls.at(-1)!
    expect(endpoint).toBe('/payments/create')
    expect(JSON.parse(init.body as string)).toMatchObject({
      order_type: 'merch',
      merch_order_id: ORDER.id,
    })
  })

  it('happy path unchanged: create ok → orderId + checkoutUrl returned', async () => {
    h.fetchDjangoApi.mockResolvedValue({ checkout_url: 'https://pay.hitpay.pelikat.test/merch' })

    const result = await startMerchCheckout(checkoutInput)
    expect(result).toMatchObject({
      ok: true,
      data: { orderId: ORDER.id, checkoutUrl: 'https://pay.hitpay.pelikat.test/merch' },
    })
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.fetchDjangoApi).toHaveBeenCalledWith(
      '/payments/create',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
