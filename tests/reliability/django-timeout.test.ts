import { describe, it, expect, vi, afterEach } from 'vitest'

// Exercises the REAL fetchDjangoApi (no @/lib/django mock): the hang
// scenario is that Django accepts the request but never responds, so the
// AbortSignal.timeout bound must abort the fetch instead of letting it
// dangle until the platform timeout. The spy hands back a manually
// fired abort so the test doesn't wait out the real 15s.
vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => ({
    supabase: {
      rpc: vi.fn().mockResolvedValue({
        data: [{ order_id: 'ord-1', order_number: 'MR-1', total_amount: 25 }],
        error: null,
      }),
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: 'p-1', full_name: 'Run Runner' }, error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    },
    user: { id: 'u-1', email: 'runner@pelikat.test' },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

process.env.DJANGO_URL = 'https://django.pelikat.test'
process.env.INTERNAL_API_KEY = 'test-key'

import { startMerchCheckout } from '@/components/merch/store-actions'

describe('fetchDjangoApi bounded timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('hanging Django POST /payments/create aborts and startMerchCheckout surfaces the reserved orderId', async () => {
    let fireTimeout!: () => void
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController()
      fireTimeout = () => controller.abort()
      return controller.signal
    })

    // Django accepts, then never answers: the pending fetch rejects only
    // when aborted (same semantics as the platform's fetch on timeout).
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) =>
      new Promise<never>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = startMerchCheckout({
      eventId: 'evt-1',
      items: [{ variantId: 'v-1', quantity: 1 }],
      method: 'fpx',
    })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // every fetchDjangoApi call gets the 15s bound (shorter than the
    // api-side 20s HitPay outbound window)
    expect(timeoutSpy).toHaveBeenCalledWith(15_000)

    fireTimeout()
    const result = await pending

    expect(result).toMatchObject({ ok: false, orderId: 'ord-1' })
    expect(result.error).toBeTruthy()
  })
})
