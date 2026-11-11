import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act, renderHook } from '@testing-library/react'

/**
 * Runner merch store + cart (FR-69/FR-70/FR-72):
 *  - FR-69: getRunnerStoreData (registered runners see the active products of
 *    their events; sales close on event date; paid registration required to
 *    check out), the closed-state notice, and shop-by-event on the orders page.
 *  - FR-70: useMerchCart add/update/remove with the 1–10 quantity cap,
 *    localStorage persistence, and the checkout submit path — startMerchCheckout
 *    → merch_checkout RPC with variant+quantity lines and NO client price
 *    (pricing is server-side).
 *  - FR-72: order confirmation (order number display) on /runner/merch and
 *    /runner/merch/orders/[orderId].
 *
 * Supabase/auth are mocked in-file (same pattern as repc-checkin.test.ts);
 * Checkout renders the REAL startMerchCheckout server action.
 */

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  tables: {} as Record<string, { rows?: unknown[]; error?: { message: string } | null }>,
  queries: [] as { table: string; eqs: unknown[][]; select?: string }[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcData: null as unknown,
  rpcError: null as { message: string } | null,
  djangoBody: null as Record<string, unknown> | null,
  djangoRejects: false as boolean,
  routerPush: [] as string[],
}))

function makeClient() {
  const table = (name: string) => h.tables[name] ?? {}
  const resolveSelect = (name: string) => ({
    data: (table(name).rows as unknown) ?? null,
    error: table(name).error ?? null,
  })

  const makeBuilder = (name: string) => {
    const q = { table: name, select: undefined as string | undefined, eqs: [] as unknown[][] }
    const b: Record<string, unknown> = {
      select: (cols: string) => {
        q.select = cols
        return b
      },
      eq: (col: unknown, val: unknown) => {
        q.eqs.push([col, val])
        return b
      },
      in: () => b,
      order: () => b,
      then: (res: (v: unknown) => void, rej: (v: unknown) => void) => {
        h.queries.push(q)
        return Promise.resolve(resolveSelect(name)).then(res, rej)
      },
      single: async () => {
        h.queries.push(q)
        return { data: (table(name).rows?.[0] as unknown) ?? null, error: table(name).error ?? null }
      },
      maybeSingle: async () => {
        h.queries.push(q)
        return { data: (table(name).rows?.[0] as unknown) ?? null, error: table(name).error ?? null }
      },
    }
    return b
  }

  return {
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ name, args })
      return { data: h.rpcData, error: h.rpcError }
    },
    from: (name: string) => makeBuilder(name),
  }
}

const storeUser = { id: 'user-1', email: 'runner@pelikat.my', app_metadata: { role: 'runner' } }

vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => ({ supabase: makeClient(), user: h.user ?? storeUser }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeClient(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (path: string) => {
      h.routerPush.push(path)
    },
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

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
  fetchDjangoApi: async (_endpoint: string, init?: { body?: string }) => {
    if (h.djangoRejects) throw new Error('gateway down')
    h.djangoBody = JSON.parse(init?.body ?? '{}')
    return { checkout_url: 'https://pay.hitpay.pelikat.test/merch' }
  },
}))

// the order page mounts the pending-order poll; stub it out (it has its
// own dedicated test in merch-order-status-polling.test.tsx)
vi.mock('@/components/merch/store/pending-order-actions', () => ({
  PendingOrderActions: () => <div data-testid="pending-actions" />,
}))

import { useMerchCart } from '@/components/merch/store/use-merch-cart'
import { Storefront } from '@/components/merch/store/storefront'
import { Checkout } from '@/components/merch/store/checkout'
import { getRunnerStoreData } from '@/components/merch/store/queries'
import { MERCH_MAX_QTY_PER_ITEM } from '@/lib/merch'

const cartLine = (over: Record<string, unknown> = {}) => ({
  variantId: 'v1',
  productId: 'p1',
  name: 'Finisher Tee',
  variantLabel: 'M',
  price: 10,
  imagePath: null,
  quantity: 1,
  ...over,
})

const storeEvent = { id: 'evt-1', name: 'Pelikat Run 2026', event_date: '2100-01-01', location: 'Dataran Pelikat' }

const product = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Finisher Tee',
  description: null,
  price: 19.5,
  image_path: null,
  low_stock_threshold: 5,
  merch_variants: [
    { id: 'v1', size: 'M', color: null, stock: 3 },
    { id: 'v2', size: null, color: null, stock: 0 },
  ],
  ...over,
})

const storeData = (over: Record<string, unknown> = {}) => ({
  event: storeEvent,
  registered: true,
  registrationPaid: true,
  salesClosed: false,
  products: [product()],
  ...over,
})

// the cart is a module-level per-event cache — every test gets its own
// event id so seeds never collide (offset avoids the storefront's default
// 'evt-1' id, which earlier renders may have cached empty)
let uid = 0
const uniqEvent = () => `evt-t${++uid}`

const seedCart = (eventId: string, lines: Record<string, unknown>[]) =>
  window.localStorage.setItem(`pelikat:merch-cart:${eventId}`, JSON.stringify(lines))

beforeEach(() => {
  h.user = storeUser
  h.tables = {}
  h.queries = []
  h.rpcCalls = []
  h.rpcData = null
  h.rpcError = null
  h.djangoBody = null
  h.djangoRejects = false
  h.routerPush = []
  window.localStorage.clear()
})

afterEach(() => cleanup())

describe('FR-70: useMerchCart — add / update / remove with the 1–10 quantity cap', () => {
  const hook = (eventId: string) => renderHook(() => useMerchCart(eventId))

  it('merges repeat adds of the same variant, capped at 10', () => {
    const cart = hook('evt-cart-a')
    act(() => cart.result.current.add(cartLine({ quantity: 2 })))
    expect(cart.result.current.lines).toHaveLength(1)
    act(() => cart.result.current.add(cartLine({ quantity: 9 })))
    expect(cart.result.current.lines[0].quantity).toBe(MERCH_MAX_QTY_PER_ITEM)
    expect(cart.result.current.count).toBe(10)
    expect(cart.result.current.subtotal).toBe(100)
  })

  it('clamps a fresh add over the cap instead of accepting it', () => {
    const cart = hook('evt-cart-b')
    act(() => cart.result.current.add(cartLine({ quantity: 15 })))
    expect(cart.result.current.lines[0].quantity).toBe(MERCH_MAX_QTY_PER_ITEM)
  })

  it('setQuantity updates within bounds, clamps over 10 and removes at 0', () => {
    const cart = hook('evt-cart-c')
    act(() => cart.result.current.add(cartLine()))
    act(() => cart.result.current.setQuantity('v1', 3))
    expect(cart.result.current.lines[0].quantity).toBe(3)
    act(() => cart.result.current.setQuantity('v1', 99))
    expect(cart.result.current.lines[0].quantity).toBe(10)
    act(() => cart.result.current.setQuantity('v1', 0))
    expect(cart.result.current.lines).toHaveLength(0)
  })

  it('remove() drops the line and clear() empties the persisted cart', () => {
    const cart = hook('evt-cart-d')
    act(() => cart.result.current.add(cartLine()))
    act(() => cart.result.current.add(cartLine({ variantId: 'v2' })))
    act(() => cart.result.current.remove('v1'))
    expect(cart.result.current.lines.map((l) => l.variantId)).toEqual(['v2'])
    act(() => cart.result.current.clear())
    expect(cart.result.current.lines).toEqual([])
    expect(window.localStorage.getItem('pelikat:merch-cart:evt-cart-d')).toBeNull()
  })

  it('persists per event in localStorage and survives a remount', () => {
    const cart = hook('evt-cart-e')
    act(() => cart.result.current.add(cartLine({ quantity: 2 })))
    expect(JSON.parse(window.localStorage.getItem('pelikat:merch-cart:evt-cart-e') ?? '[]')).toEqual([
      cartLine({ quantity: 2 }),
    ])

    const remounted = hook('evt-cart-e')
    expect(remounted.result.current.count).toBe(2)
  })

  it('syncs with another tab via the storage event', () => {
    seedCart('evt-cart-f', [cartLine({ quantity: 1 })])
    const cart = hook('evt-cart-f')
    expect(cart.result.current.count).toBe(1)

    act(() => {
      seedCart('evt-cart-f', [cartLine({ variantId: 'v2', quantity: 3 })])
      window.dispatchEvent(new StorageEvent('storage', { key: 'pelikat:merch-cart:evt-cart-f' }))
    })
    expect(cart.result.current.lines[0]).toMatchObject({ variantId: 'v2', quantity: 3 })
  })
})

describe('FR-69: getRunnerStoreData — event-date gating + paid registration', () => {
  it('loads the active products of the event and gates checkout on a paid registration', async () => {
    h.tables = {
      runner_profiles: { rows: [{ id: 'r1' }] },
      events: { rows: [storeEvent] },
      registrations: { rows: [{ payment_status: 'paid' }] },
      merch_products: {
        rows: [
          product({ merch_variants: [{ id: 'v2', size: 'L', color: null, stock: 1 }, { id: 'v1', size: 'M', color: null, stock: 3 }] }),
        ],
      },
    }

    const data = await getRunnerStoreData(makeClient() as never, 'evt-1')

    expect(data.registered).toBe(true)
    expect(data.registrationPaid).toBe(true)
    expect(data.salesClosed).toBe(false) // event_date 2100 > today
    expect(data.products[0].merch_variants.map((v) => v.id)).toEqual(['v1', 'v2']) // canonical sort
    // only active products are ever listed
    const productsQuery = h.queries.find((q) => q.table === 'merch_products')
    expect(productsQuery?.eqs).toEqual(expect.arrayContaining([['event_id', 'evt-1'], ['is_active', true]]))
  })

  it('marks sales closed once the event date has passed (MY timezone cut-off)', async () => {
    h.tables = {
      runner_profiles: { rows: [{ id: 'r1' }] },
      events: { rows: [{ ...storeEvent, event_date: '2020-01-01' }] },
      registrations: { rows: [{ payment_status: 'paid' }] },
      merch_products: { rows: [product()] },
    }

    const data = await getRunnerStoreData(makeClient() as never, 'evt-1')
    expect(data.salesClosed).toBe(true)
  })

  it('treats only paid / waived registrations as paid (pending is not)', async () => {
    h.tables = {
      runner_profiles: { rows: [{ id: 'r1' }] },
      events: { rows: [storeEvent] },
      registrations: { rows: [{ payment_status: 'pending' }] },
      merch_products: { rows: [product()] },
    }
    expect((await getRunnerStoreData(makeClient() as never, 'evt-1')).registrationPaid).toBe(false)

    h.tables.registrations = { rows: [{ payment_status: 'waived' }] }
    expect((await getRunnerStoreData(makeClient() as never, 'evt-1')).registrationPaid).toBe(true)
  })

  it('anonymous visitors get no registration context but still see products', async () => {
    h.user = null
    h.tables = {
      events: { rows: [storeEvent] },
      merch_products: { rows: [product()] },
    }

    const data = await getRunnerStoreData(makeClient() as never, 'evt-1')
    expect(data.registered).toBe(false)
    expect(data.registrationPaid).toBe(false)
    expect(data.products).toHaveLength(1)
  })
})

describe('FR-69: Storefront — closed state, unpaid gate and the cart bar', () => {
  it('shows the closed notice for a past event', () => {
    render(<Storefront data={storeData({ salesClosed: true }) as never} />)
    expect(screen.getByText('Merch sales for this event have closed.')).toBeInTheDocument()
  })

  it('points unpaid runners to their registration payment before checkout', () => {
    render(<Storefront data={storeData({ registrationPaid: false }) as never} />)
    const link = screen.getByRole('link', { name: /complete your race registration payment/i })
    expect(link).toHaveAttribute('href', '/runner/events/evt-1/payment')
  })

  it('lists products with prices, low-stock and sold-out badges (stock vs threshold)', () => {
    const soldOut = product({ id: 'p2', name: 'Cap', merch_variants: [{ id: 'v9', size: null, color: null, stock: 0 }] })
    render(<Storefront data={storeData({ products: [product(), soldOut] }) as never} />)
    expect(screen.getAllByText('Finisher Tee').length).toBeGreaterThan(0)
    expect(screen.getAllByText('RM 19.50').length).toBeGreaterThan(0)
    // product stock (3) ≤ low_stock_threshold (5) → few left
    expect(screen.getByText('Few left')).toBeInTheDocument()
    // product stock 0 → sold out
    expect(screen.getByText('Sold out')).toBeInTheDocument()
  })

  it('shows the cart bar with count + subtotal once items are in the cart', () => {
    const eventId = uniqEvent()
    seedCart(eventId, [cartLine({ quantity: 2, price: 19.5 }), cartLine({ variantId: 'v2', quantity: 1, price: 12 })])
    render(<Storefront data={storeData({ event: { ...storeEvent, id: eventId } }) as never} />)

    expect(screen.getByText('3 items')).toBeInTheDocument()
    const checkoutLink = screen.getByRole('link', { name: /RM 51.00/i })
    expect(checkoutLink).toHaveAttribute('href', `/runner/events/${eventId}/merch/checkout`)
  })

  it('product sheet: picks a variant, respects per-variant stock when adding', () => {
    const eventId = uniqEvent()
    seedCart(eventId, [cartLine({ quantity: 3 })]) // all 3 of v1 already reserved by the cart
    render(<Storefront data={storeData({ event: { ...storeEvent, id: eventId } }) as never} />)

    fireEvent.click(screen.getAllByRole('button', { name: /Finisher Tee/i })[0])
    // v1 is at its limit, v2 is sold out → nothing can be added
    const add = screen.getByRole('button', { name: 'Limit reached' })
    expect(add).toBeDisabled()
  })

  it('product sheet: adding to the cart persists the chosen variant + quantity', () => {
    const eventId = uniqEvent()
    render(<Storefront data={storeData({ event: { ...storeEvent, id: eventId } }) as never} />)

    fireEvent.click(screen.getAllByRole('button', { name: /Finisher Tee/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /^M$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add to cart · RM 19.50/i }))

    expect(JSON.parse(window.localStorage.getItem(`pelikat:merch-cart:${eventId}`) ?? '[]')).toEqual([
      cartLine({ variantId: 'v1', quantity: 1, price: 19.5 }),
    ])
  })
})

describe('FR-70: Checkout — submit path with server-side pricing', () => {
  // each test gets its own event id: the cart cache is per-event and a
  // cleared cart stays cached empty for that event
  const checkoutData = () => {
    const eventId = uniqEvent()
    return { eventId, data: storeData({ event: { ...storeEvent, id: eventId } }) }
  }

  it('renders the cart repriced from live products, with the 15-minute reservation note', () => {
    const { eventId, data } = checkoutData()
    seedCart(eventId, [cartLine({ quantity: 2, price: 10 })]) // saved cart says RM 20…
    render(<Checkout data={data as never} />)

    // …but checkout re-prices from the current product (RM 19.50 × 2) —
    // the line price AND the total are both live-product derived
    expect(screen.getAllByText('RM 39.00').length).toBe(2)
    expect(screen.getByText('Items are held for 15 minutes while you pay.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Proceed to payment/i })).not.toBeDisabled()
  })

  it('blocks payment until the registration is paid (FR-69 gate at checkout)', () => {
    const { eventId, data } = checkoutData()
    seedCart(eventId, [cartLine({ quantity: 2 })])
    render(<Checkout data={{ ...data, registrationPaid: false } as never} />)

    expect(screen.getByRole('button', { name: /Proceed to payment/i })).toBeDisabled()
    expect(screen.getByText(/Complete your race registration payment/i)).toBeInTheDocument()
  })

  it('blocks payment once sales are closed', () => {
    const { eventId, data } = checkoutData()
    seedCart(eventId, [cartLine({ quantity: 2 })])
    render(<Checkout data={{ ...data, salesClosed: true } as never} />)

    expect(screen.getByRole('button', { name: /Proceed to payment/i })).toBeDisabled()
    expect(screen.getByText('Merch sales for this event have closed.')).toBeInTheDocument()
  })

  it('submits variant + quantity lines to merch_checkout and never a client price', async () => {
    const { eventId, data } = checkoutData()
    h.rpcData = [{ order_id: 'ord-1', order_number: 'MO-1', total_amount: 999 }]
    seedCart(eventId, [cartLine({ quantity: 2, price: 10 })]) // cart says RM 20…
    render(<Checkout data={data as never} />)

    fireEvent.click(screen.getByRole('button', { name: /Proceed to payment/i }))
    await waitFor(() => expect(h.rpcCalls).toHaveLength(1))

    // exact RPC args: event, lines as {variant_id, quantity}, chosen method
    expect(h.rpcCalls[0]).toEqual({
      name: 'merch_checkout',
      args: {
        p_event_id: eventId,
        p_items: [{ variant_id: 'v1', quantity: 2 }],
        p_payment_method: 'fpx',
      },
    })
    // no client-side price ever reaches the RPC — the DB prices the order
    expect(JSON.stringify(h.rpcCalls[0].args)).not.toMatch(/price|amount|total/i)
    // Django /payments/create is handed the SERVER-computed total (999), not 20
    await waitFor(() => expect(h.djangoBody).not.toBeNull())
    expect(h.djangoBody).toMatchObject({ order_type: 'merch', merch_order_id: 'ord-1', amount: 999 })
  })

  it('clears the cart and routes to the reserved order when payment init fails', async () => {
    const { eventId, data } = checkoutData()
    h.rpcData = [{ order_id: 'ord-1', order_number: 'MO-1', total_amount: 20 }]
    h.djangoRejects = true
    seedCart(eventId, [cartLine({ quantity: 2 })])
    render(<Checkout data={data as never} />)

    fireEvent.click(screen.getByRole('button', { name: /Proceed to payment/i }))
    await waitFor(() => expect(h.routerPush).toEqual(['/runner/merch/orders/ord-1']))

    // the cart is spent — merch_checkout already reserved the stock — and
    // the empty state renders (the error notice is gone with the cart)
    expect(window.localStorage.getItem(`pelikat:merch-cart:${eventId}`)).toBeNull()
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
  })
})

describe('FR-72: /runner/merch — order history split + shop-by-event', () => {
  const orderRow = (over: Record<string, unknown> = {}) => ({
    id: 'ord-1',
    order_number: 'MO-1001',
    status: 'ready',
    total_amount: '55.00',
    created_at: '2026-01-01T10:00:00Z',
    expires_at: null,
    paid_at: null,
    ready_at: null,
    collected_at: null,
    cancelled_at: null,
    cancel_reason: null,
    payment_method: 'fpx',
    payment_ref: null,
    event_id: 'evt-1',
    events: { id: 'evt-1', name: 'Pelikat Run 2026', event_date: '2100-01-01', location: null },
    merch_order_items: [{ id: 'i1', quantity: 2, unit_price: 27.5, product_name: 'Finisher Tee', variant_label: 'M' }],
    ...over,
  })

  it('groups active vs past orders and shows the order number + items', async () => {
    h.tables = {
      runner_profiles: { rows: [{ id: 'r1' }] },
      registrations: {
        rows: [
          { event_id: 'evt-1', events: { id: 'evt-1', name: 'Pelikat Run 2026', event_date: '2100-01-01' } },
          { event_id: 'evt-2', events: { id: 'evt-2', name: 'No Merch Event', event_date: '2100-01-02' } },
        ],
      },
      merch_products: { rows: [{ event_id: 'evt-1' }] },
      merch_orders: {
        rows: [
          orderRow(),
          orderRow({ id: 'ord-2', order_number: 'MO-1002', status: 'cancelled', cancel_reason: 'expired', merch_order_items: [] }),
        ],
      },
    }

    const Page = (await import('@/app/runner/merch/page')).default
    render(await Page())

    // FR-69: only registered upcoming events WITH products are shop-able
    // (order cards also embed the event name, so use All* queries)
    expect(screen.getAllByText('Pelikat Run 2026').length).toBeGreaterThan(0)
    expect(screen.queryByText('No Merch Event')).toBeNull()
    expect(
      screen
        .getAllByRole('link', { name: /Pelikat Run 2026/ })
        .map((l) => l.getAttribute('href'))
    ).toContain('/runner/events/evt-1/merch')

    // FR-73/FR-72: order numbers + status split
    expect(screen.getAllByText('MO-1001').length).toBeGreaterThan(0)
    expect(screen.getByText('MO-1002')).toBeInTheDocument()
    expect(screen.getByText('Past orders')).toBeInTheDocument()
    expect(screen.getByText('2 items · Finisher Tee')).toBeInTheDocument()
    expect(screen.getAllByText('RM 55.00').length).toBeGreaterThan(0)
  })

  it('shows the empty state when the runner has no orders', async () => {
    h.tables = {
      runner_profiles: { rows: [{ id: 'r1' }] },
      registrations: { rows: [] },
      merch_products: { rows: [] },
      merch_orders: { rows: [] },
    }

    const Page = (await import('@/app/runner/merch/page')).default
    render(await Page())

    expect(screen.getByText('No orders yet')).toBeInTheDocument()
    expect(screen.getByText('No merch on sale')).toBeInTheDocument()
  })
})

describe('FR-72: /runner/merch/orders/[orderId] — confirmation + order number', () => {
  const baseOrder = {
    id: 'ord-1',
    order_number: 'MO-1001',
    status: 'confirmed',
    total_amount: '55.00',
    created_at: '2026-01-01T10:00:00Z',
    expires_at: null,
    paid_at: '2026-01-01T10:05:00Z',
    ready_at: null,
    collected_at: null,
    cancelled_at: null,
    cancel_reason: null,
    payment_method: 'fpx',
    payment_ref: 'HP-123',
    event_id: 'evt-1',
    events: { id: 'evt-1', name: 'Pelikat Run 2026', event_date: '2100-01-01', location: 'Dataran Pelikat' },
    merch_order_items: [{ id: 'i1', quantity: 2, unit_price: 27.5, product_name: 'Finisher Tee', variant_label: 'M' }],
  }

  const mount = async (order: Record<string, unknown>, paid?: string) => {
    h.tables = { merch_orders: { rows: order ? [order] : [] } }
    const Page = (await import('@/app/runner/merch/orders/[orderId]/page')).default
    return render(
      await Page({
        params: Promise.resolve({ orderId: 'ord-1' }),
        searchParams: Promise.resolve({ paid }),
      })
    )
  }

  it('celebrates a just-paid confirmation with the order number to keep (FR-72)', async () => {
    await mount(baseOrder, '1')

    expect(screen.getByText('Payment successful')).toBeInTheDocument()
    expect(screen.getByText('Your order is confirmed. Keep this order number:')).toBeInTheDocument()
    expect(screen.getAllByText('MO-1001').length).toBeGreaterThanOrEqual(1) // big number + collect notice
    expect(screen.getByText('View all my orders')).toBeInTheDocument()
  })

  it('renders the standing order number + status timeline otherwise', async () => {
    await mount({ ...baseOrder, status: 'ready' })

    expect(screen.getByText('Order number')).toBeInTheDocument()
    expect(screen.getAllByText('MO-1001').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Ready to collect at REPC')).toBeInTheDocument()
    // collect-at-REPC notice quotes the order number
    expect(screen.getAllByText(/MO-1001/).length).toBeGreaterThan(0)
  })

  it('explains a cancelled order using the runner-facing cancel reason', async () => {
    await mount({ ...baseOrder, status: 'cancelled', cancel_reason: 'expired', paid_at: null, payment_ref: null })

    expect(screen.getByText('Payment was not completed within the reservation time.')).toBeInTheDocument()
  })

  it('shows items, the server-side total and the payment reference', async () => {
    await mount(baseOrder)

    expect(screen.getByText('Finisher Tee')).toBeInTheDocument()
    expect(screen.getByText(/M · 2 × RM 27.50/)).toBeInTheDocument()
    expect(screen.getAllByText('RM 55.00').length).toBeGreaterThan(0)
    expect(screen.getByText('HP-123')).toBeInTheDocument()
  })

  it('404s an order the runner cannot see (RLS empty result)', async () => {
    await expect(mount(null)).rejects.toThrow(/NOT_FOUND/)
  })
})
