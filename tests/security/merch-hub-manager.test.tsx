import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * Merch Hub Manager contract tests (FR-37..FR-41), organizer side:
 *  - FR-37: saveMerchProduct create/update with variants (validation,
 *    variant diffing, rollback on variant failure, image cleanup).
 *  - FR-38: updateMerchVariantStock bounds + stockLevel low-stock warning
 *    thresholds.
 *  - FR-40: updateMerchOrderStatus → merch_update_order_status(uuid[])
 *    bulk RPC, and the OrderTable status filter + bulk fulfilment UI.
 *  - FR-41: getMerchHubData aggregation (sales/paid/pending counts).
 *
 * Supabase server client is mocked in-file (same pattern as
 * repc-checkin.test.ts); the OrderTable test exercises the REAL
 * updateMerchOrderStatus action through the mocked client.
 */

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  tables: {} as Record<
    string,
    {
      rows?: unknown[]
      error?: { message: string } | null
      insertSingle?: unknown
      insertError?: { code?: string; message: string } | null
      updateRows?: unknown[]
      updateError?: { message: string } | null
      deleteError?: { code?: string; message: string } | null
    }
  >,
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string; row: Record<string, unknown>; eqs: unknown[][] }[],
  deletes: [] as { table: string; eqs: unknown[][]; ins: unknown[][] }[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  rpcData: null as unknown,
  rpcError: null as { message: string } | null,
  storageRemovals: [] as string[],
  revalidated: [] as string[],
  safeProfiles: {} as Record<string, { full_name: string | null } | null>,
}))

vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => {
    if (!h.user) {
      // next/navigation redirect throws NEXT_REDIRECT — the actions never
      // reach the database for anonymous callers.
      throw new Error('NEXT_REDIRECT: /login')
    }
    return { supabase: makeClient(), user: h.user }
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    h.revalidated.push(path)
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: () => {
    throw new Error('NEXT_REDIRECT: /login')
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/runner-profiles-safe', () => ({
  getSafeRunnerProfiles: async () => new Map(Object.entries(h.safeProfiles)),
}))

function makeClient() {
  const table = (name: string) => h.tables[name] ?? {}
  const resolveSelect = (name: string) => ({
    data: (table(name).rows as unknown) ?? null,
    error: table(name).error ?? null,
  })

  const makeBuilder = (name: string) => {
    const q = {
      select: undefined as string | undefined,
      eqs: [] as unknown[][],
      ins: [] as unknown[][],
    }
    const b: Record<string, unknown> = {
      select: (cols: string) => {
        q.select = cols
        return b
      },
      eq: (col: unknown, val: unknown) => {
        q.eqs.push([col, val])
        return b
      },
      in: (col: unknown, vals: unknown[]) => {
        q.ins.push([col, vals])
        return b
      },
      order: () => b,
      // plain select chains are awaited directly → { data: rows[] }
      then: (res: (v: unknown) => void, rej: (v: unknown) => void) =>
        Promise.resolve(resolveSelect(name)).then(res, rej),
      // .single()/.maybeSingle() return the FIRST row, like PostgREST
      single: async () => ({
        data: (table(name).rows?.[0] as unknown) ?? null,
        error: table(name).error ?? null,
      }),
      maybeSingle: async () => ({
        data: (table(name).rows?.[0] as unknown) ?? null,
        error: table(name).error ?? null,
      }),
    }
    return b
  }

  return {
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ name, args })
      return { data: h.rpcData, error: h.rpcError }
    },
    from: (name: string) => ({
      ...makeBuilder(name),
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          h.inserts.push({ table: name, row })
        }
        const t = table(name)
        const thenable = {
          then: (res: (v: unknown) => void) =>
            Promise.resolve({ data: null, error: t.insertError ?? null }).then(res),
        }
        return {
          ...thenable,
          select: () => ({
            single: async () => ({ data: t.insertSingle ?? null, error: t.insertError ?? null }),
          }),
        }
      },
      update: (row: Record<string, unknown>) => {
        const entry = { table: name, row, eqs: [] as unknown[][] }
        h.updates.push(entry)
        const eqChain = {
          eq: (col: unknown, val: unknown) => {
            entry.eqs.push([col, val])
            return eqChain
          },
          select: async () => ({
            data: table(name).updateRows ?? [],
            error: table(name).updateError ?? null,
          }),
        }
        return eqChain
      },
      delete: () => {
        const entry = { table: name, eqs: [] as unknown[][], ins: [] as unknown[][] }
        h.deletes.push(entry)
        const thenable = {
          then: (res: (v: unknown) => void) =>
            Promise.resolve({ data: null, error: table(name).deleteError ?? null }).then(res),
        }
        return {
          ...thenable,
          eq: (col: unknown, val: unknown) => {
            entry.eqs.push([col, val])
            return thenable
          },
          in: (col: unknown, vals: unknown[]) => {
            entry.ins.push([col, vals])
            return thenable
          },
        }
      },
    }),
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          h.storageRemovals.push(...paths)
          return Promise.resolve({ data: null, error: null })
        },
      }),
    },
  }
}

const organizerUser = { id: 'org-user-1', email: 'org@pelikat.my', app_metadata: { organizer_id: 'org-1' } }

const productInput = (over: Record<string, unknown> = {}) => ({
  eventId: 'evt-1',
  name: 'Finisher Tee',
  description: '  Dri-fit tee  ',
  price: 12.345,
  lowStockThreshold: 5,
  isActive: true,
  imagePath: null as string | null,
  variants: [
    { size: ' M ', color: 'Black', stock: 10 },
    { size: null, color: '', stock: 0 },
  ],
  ...over,
})

beforeEach(() => {
  h.user = organizerUser
  h.tables = {}
  h.inserts = []
  h.updates = []
  h.deletes = []
  h.rpcCalls = []
  h.rpcData = null
  h.rpcError = null
  h.storageRemovals = []
  h.revalidated = []
  h.safeProfiles = {}
})

afterEach(() => cleanup())

describe('FR-37: saveMerchProduct — product create with variants', () => {
  it('inserts the product with organizer + event ownership and normalized variants', async () => {
    h.tables['merch_products'] = { insertSingle: { id: 'prod-1' } }

    const { saveMerchProduct } = await import('@/components/merch/actions')
    const result = await saveMerchProduct(productInput())

    expect(result).toEqual({ ok: true, data: { id: 'prod-1' } })
    expect(h.inserts[0]).toEqual({
      table: 'merch_products',
      row: {
        name: 'Finisher Tee',
        description: 'Dri-fit tee',
        price: 12.35, // server rounds to 2 dp — never trusts raw input
        low_stock_threshold: 5,
        is_active: true,
        image_path: null,
        updated_at: expect.any(String),
        event_id: 'evt-1',
        organizer_id: 'org-1',
      },
    })
    expect(h.inserts.slice(1)).toEqual([
      {
        table: 'merch_variants',
        row: { size: 'M', color: 'Black', stock: 10, product_id: 'prod-1' },
      },
      {
        table: 'merch_variants',
        row: { size: null, color: null, stock: 0, product_id: 'prod-1' },
      },
    ])
    expect(h.revalidated).toEqual(['/organizer/merch', '/organizer/mobile/merch'])
  })

  it('rejects invalid input before touching the database', async () => {
    const { saveMerchProduct } = await import('@/components/merch/actions')

    expect(await saveMerchProduct(productInput({ name: '   ' }))).toEqual({
      ok: false,
      error: 'Product name is required.',
    })
    expect(await saveMerchProduct(productInput({ price: -1 }))).toEqual({
      ok: false,
      error: 'Price must be 0 or more.',
    })
    expect(await saveMerchProduct(productInput({ lowStockThreshold: 1.5 }))).toEqual({
      ok: false,
      error: 'Low-stock threshold must be a whole number, 0 or more.',
    })
    expect(await saveMerchProduct(productInput({ variants: [] }))).toEqual({
      ok: false,
      error: 'Add at least one variant.',
    })
    expect(
      await saveMerchProduct(productInput({ variants: [{ size: 'M', color: null, stock: -1 }] }))
    ).toEqual({ ok: false, error: 'Stock must be a whole number, 0 or more.' })

    expect(h.inserts).toHaveLength(0)
  })

  it('rolls the product back when variant creation fails (23505 friendly message)', async () => {
    h.tables['merch_products'] = { insertSingle: { id: 'prod-1' } }
    h.tables['merch_variants'] = { insertError: { code: '23505', message: 'duplicate key' } }

    const { saveMerchProduct } = await import('@/components/merch/actions')
    const result = await saveMerchProduct(productInput())

    expect(result).toEqual({ ok: false, error: 'Each variant must have a unique size and color.' })
    // the half-created product is deleted again
    expect(h.deletes).toEqual([{ table: 'merch_products', eqs: [['id', 'prod-1']], ins: [] }])
  })

  it('anonymous callers are redirected before any write', async () => {
    h.user = null
    const { saveMerchProduct } = await import('@/components/merch/actions')
    await expect(saveMerchProduct(productInput())).rejects.toThrow(/NEXT_REDIRECT/)
    expect(h.inserts).toHaveLength(0)
  })
})

describe('FR-37: saveMerchProduct — product update with variant diffing', () => {
  const existing = {
    id: 'prod-1',
    image_path: 'old.png',
    merch_variants: [{ id: 'v-keep' }, { id: 'v-remove' }],
  }

  const updateInput = productInput({
    id: 'prod-1',
    imagePath: null, // image removed → old file deleted from storage
    variants: [
      { id: 'v-keep', size: 'M', color: 'Black', stock: 4 },
      { size: 'L', color: null, stock: 2 }, // new
    ],
  })

  it('removes deleted variants first, updates kept ones scoped to the product, inserts new ones', async () => {
    h.tables['merch_products'] = { rows: [existing], updateRows: [{ id: 'prod-1' }] }
    h.tables['merch_variants'] = { updateRows: [{ id: 'v-keep' }] }

    const { saveMerchProduct } = await import('@/components/merch/actions')
    const result = await saveMerchProduct(updateInput)

    expect(result).toEqual({ ok: true, data: { id: 'prod-1' } })
    expect(h.deletes).toEqual([
      { table: 'merch_variants', eqs: [], ins: [['id', ['v-remove']]] },
    ])
    const variantUpdate = h.updates.find((u) => u.table === 'merch_variants')
    expect(variantUpdate?.row).toEqual({ size: 'M', color: 'Black', stock: 4 })
    // variant edits are scoped to the product — never another product's variant
    expect(variantUpdate?.eqs).toEqual([['id', 'v-keep'], ['product_id', 'prod-1']])
    expect(h.inserts).toEqual([
      {
        table: 'merch_variants',
        row: { size: 'L', color: null, stock: 2, product_id: 'prod-1' },
      },
    ])
    expect(h.storageRemovals).toEqual(['old.png'])
  })

  it('maps a referenced variant (23503) to the restock-instead-of-delete message', async () => {
    h.tables['merch_products'] = { rows: [existing] }
    h.tables['merch_variants'] = { deleteError: { code: '23503', message: 'foreign key' } }

    const { saveMerchProduct } = await import('@/components/merch/actions')
    const result = await saveMerchProduct(updateInput)

    expect(result).toEqual({
      ok: false,
      error: 'A variant you removed already has orders. Set its stock to 0 instead.',
    })
    // no product/variant writes happened after the failed delete
    expect(h.updates).toHaveLength(0)
    expect(h.inserts).toHaveLength(0)
  })
})

describe('FR-38: stock edits + low-stock warning thresholds', () => {
  it('updateMerchVariantStock rejects non-integer / negative stock without a write', async () => {
    const { updateMerchVariantStock } = await import('@/components/merch/actions')

    expect(await updateMerchVariantStock([{ id: 'v1', stock: -1 }])).toEqual({
      ok: false,
      error: 'Stock must be a whole number, 0 or more.',
    })
    expect(await updateMerchVariantStock([{ id: 'v1', stock: 2.5 }])).toEqual({
      ok: false,
      error: 'Stock must be a whole number, 0 or more.',
    })
    expect(h.updates).toHaveLength(0)
  })

  it('applies the stock edit to the exact variant and revalidates the hub', async () => {
    h.tables['merch_variants'] = { updateRows: [{ id: 'v1' }] }

    const { updateMerchVariantStock } = await import('@/components/merch/actions')
    const result = await updateMerchVariantStock([
      { id: 'v1', stock: 3 },
      { id: 'v2', stock: 0 },
    ])

    expect(result).toEqual({ ok: true, data: undefined })
    expect(h.updates).toEqual([
      { table: 'merch_variants', row: { stock: 3 }, eqs: [['id', 'v1']] },
      { table: 'merch_variants', row: { stock: 0 }, eqs: [['id', 'v2']] },
    ])
    expect(h.revalidated).toEqual(['/organizer/merch', '/organizer/mobile/merch'])
  })

  it('surfaces an unknown variant instead of silently succeeding', async () => {
    h.tables['merch_variants'] = { updateRows: [] }

    const { updateMerchVariantStock } = await import('@/components/merch/actions')
    expect(await updateMerchVariantStock([{ id: 'ghost', stock: 1 }])).toEqual({
      ok: false,
      error: 'Variant not found. Refresh and try again.',
    })
  })

  it('stockLevel drives the warning threshold (out / low / ok)', async () => {
    const { stockLevel } = await import('@/lib/merch')
    expect(stockLevel(0, 5)).toBe('out')
    expect(stockLevel(1, 5)).toBe('low')
    expect(stockLevel(5, 5)).toBe('low') // == threshold still warns
    expect(stockLevel(6, 5)).toBe('ok')
  })
})

describe('FR-40: updateMerchOrderStatus — bulk merch_update_order_status(uuid[])', () => {
  it('refuses an empty selection without an RPC', async () => {
    const { updateMerchOrderStatus } = await import('@/components/merch/actions')
    expect(await updateMerchOrderStatus([], 'ready')).toEqual({
      ok: false,
      error: 'No orders selected.',
    })
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('passes the exact uuid[] args and reports updated vs skipped', async () => {
    h.rpcData = 2

    const { updateMerchOrderStatus } = await import('@/components/merch/actions')
    const result = await updateMerchOrderStatus(['o1', 'o2', 'o3'], 'ready')

    expect(result).toEqual({ ok: true, data: { updated: 2, skipped: 1 } })
    expect(h.rpcCalls).toEqual([
      {
        name: 'merch_update_order_status',
        args: { p_order_ids: ['o1', 'o2', 'o3'], p_status: 'ready' },
      },
    ])
    expect(h.revalidated).toEqual(['/organizer/merch', '/organizer/mobile/merch'])
  })

  it('surfaces RPC rejections (e.g. unsupported status) to the organizer', async () => {
    h.rpcError = { message: 'Unsupported status: pending' }

    const { updateMerchOrderStatus } = await import('@/components/merch/actions')
    expect(await updateMerchOrderStatus(['o1'], 'pending')).toEqual({
      ok: false,
      error: 'Unsupported status: pending',
    })
  })

  it('the UI transition table matches the states the SQL RPC accepts', async () => {
    const { MERCH_STATUS_TRANSITIONS } = await import('@/lib/merch')
    // mirrors merch_update_order_status's v_from case in migration 062
    expect(MERCH_STATUS_TRANSITIONS).toEqual({
      pending: ['cancelled'],
      confirmed: ['ready', 'cancelled'],
      ready: ['collected', 'confirmed', 'cancelled'],
      collected: ['ready'],
      cancelled: [],
    })
  })
})

describe('FR-40: OrderTable — status filter + bulk fulfilment through the real action', () => {
  const orders = [
    { id: 'o-c1', orderNumber: 'MO-1001', status: 'confirmed' as const, total: 20, createdAt: '2026-01-01T00:00:00Z', runnerName: 'Abu', bibNumber: 'A001', items: [{ label: 'Finisher Tee (M)', quantity: 1 }] },
    { id: 'o-c2', orderNumber: 'MO-1002', status: 'confirmed' as const, total: 35, createdAt: '2026-01-02T00:00:00Z', runnerName: 'Ben', bibNumber: 'A002', items: [{ label: 'Cap', quantity: 1 }] },
    { id: 'o-r1', orderNumber: 'MO-1003', status: 'ready' as const, total: 12, createdAt: '2026-01-03T00:00:00Z', runnerName: 'Cara', bibNumber: 'B001', items: [{ label: 'Tumbler', quantity: 1 }] },
    { id: 'o-p1', orderNumber: 'MO-1004', status: 'pending' as const, total: 12, createdAt: '2026-01-04T00:00:00Z', runnerName: 'Dan', bibNumber: null, items: [{ label: 'Tumbler', quantity: 1 }] },
  ]

  it('filters orders by status tab (pending excluded from Ready)', async () => {
    const { OrderTable } = await import('@/components/merch/order-table')
    render(<OrderTable orders={orders} />)

    expect(screen.getAllByText('MO-1001').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: /Ready/ }))

    expect(screen.getAllByText('MO-1003').length).toBeGreaterThan(0)
    expect(screen.queryByText('MO-1001')).toBeNull()
    expect(screen.queryByText('MO-1004')).toBeNull()
  })

  it('search narrows by order number / runner / BIB', async () => {
    const { OrderTable } = await import('@/components/merch/order-table')
    render(<OrderTable orders={orders} />)

    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'A001' } })

    expect(screen.getAllByText('MO-1001').length).toBeGreaterThan(0)
    expect(screen.queryByText('MO-1002')).toBeNull()
  })

  it('select-all + Mark ready bulk-fulfils only confirmed orders via merch_update_order_status', async () => {
    const { OrderTable } = await import('@/components/merch/order-table')
    render(<OrderTable orders={orders} />)

    fireEvent.click(screen.getByLabelText('Select all visible orders'))
    // 4 selected, but only the 2 confirmed are fulfilment candidates
    const bulkReady = screen.getByRole('button', { name: /Mark ready \(2\)/ })
    expect(bulkReady).not.toBeDisabled()

    fireEvent.click(bulkReady)
    await waitFor(() => expect(h.rpcCalls).toHaveLength(1))

    // real action → real RPC args; only the 2 confirmed orders are sent
    expect(h.rpcCalls[0]).toEqual({
      name: 'merch_update_order_status',
      args: { p_order_ids: ['o-c1', 'o-c2'], p_status: 'ready' },
    })
    // success clears the selection — the bulk bar disappears
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Mark ready/ })).toBeNull()
    )
  })

  it('Mark ready stays disabled when the selection has nothing to fulfil', async () => {
    const { OrderTable } = await import('@/components/merch/order-table')
    render(<OrderTable orders={orders} />)

    fireEvent.click(screen.getAllByLabelText('Select MO-1004')[0]) // pending only
    expect(screen.getByRole('button', { name: /Mark ready \(0\)/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Mark collected \(0\)/ })).toBeDisabled()
    expect(h.rpcCalls).toHaveLength(0)
  })
})

describe('FR-41: getMerchHubData — sales summary aggregation', () => {
  const hubRows = () => ({
    merch_products: {
      rows: [
        {
          id: 'p1', event_id: 'evt-1', name: 'Finisher Tee', description: null, price: '19.50',
          is_active: true, image_path: null, low_stock_threshold: 5,
          merch_variants: [{ id: 'v2', size: 'L', color: null, stock: 4 }, { id: 'v1', size: 'M', color: null, stock: 2 }],
        },
      ],
    },
    merch_orders: {
      rows: [
        { id: 'o1', order_number: 'MO-1', status: 'confirmed', total_amount: '39.00', created_at: 't', ready_at: null, collected_at: null, runner_id: 'r1', merch_order_items: [{ quantity: 2, unit_price: 19.5, merch_variants: { size: 'M', color: null, merch_products: { name: 'Finisher Tee' } } }] },
        { id: 'o2', order_number: 'MO-2', status: 'ready', total_amount: '19.50', created_at: 't', ready_at: null, collected_at: null, runner_id: 'r1', merch_order_items: [{ quantity: 1, unit_price: 19.5, merch_variants: { size: 'M', color: null, merch_products: { name: 'Finisher Tee' } } }] },
        { id: 'o3', order_number: 'MO-3', status: 'collected', total_amount: '19.50', created_at: 't', ready_at: null, collected_at: null, runner_id: 'r-unknown', merch_order_items: [{ quantity: 1, unit_price: 19.5, merch_variants: null }] },
        { id: 'o4', order_number: 'MO-4', status: 'pending', total_amount: '19.50', created_at: 't', ready_at: null, collected_at: null, runner_id: 'r1', merch_order_items: [] },
        { id: 'o5', order_number: 'MO-5', status: 'cancelled', total_amount: '19.50', created_at: 't', ready_at: null, collected_at: null, runner_id: 'r1', merch_order_items: [] },
      ],
    },
    merch_product_sales: {
      rows: [{ product_id: 'p1', name: 'Finisher Tee', items_sold: '12', revenue: '345.60' }],
    },
    registrations: { rows: [{ runner_id: 'r1', bib_number: 'A001' }] },
  })

  it('counts paid orders from confirmed/ready/collected only, and pending separately', async () => {
    h.tables = hubRows()
    h.safeProfiles = { r1: { full_name: 'Abu Runner' } }

    const { getMerchHubData } = await import('@/components/merch/queries')
    const hub = await getMerchHubData(makeClient() as never, 'evt-1')

    expect(hub.paidOrders).toBe(3) // confirmed + ready + collected; pending/cancelled excluded
    expect(hub.pendingOrders).toBe(1)
    expect(hub.error).toBeNull()

    // order rows are shaped for OrderTable, with BIB + safe runner name
    expect(hub.orders[0]).toEqual({
      id: 'o1',
      orderNumber: 'MO-1',
      status: 'confirmed',
      total: 39,
      createdAt: 't',
      runnerName: 'Abu Runner',
      bibNumber: 'A001',
      items: [{ quantity: 2, label: 'Finisher Tee (M)' }],
    })
    // unknown runner falls back + detached variant renders as removed
    expect(hub.orders[2].runnerName).toBe('Unknown runner')
    expect(hub.orders[2].items[0].label).toBe('Removed item')

    // product variants are sorted canonically
    expect(hub.products[0].merch_variants.map((v) => v.id)).toEqual(['v1', 'v2'])
    // sales numbers are coerced from the view's strings
    expect(hub.sales).toEqual([{ product_id: 'p1', name: 'Finisher Tee', items_sold: 12, revenue: 345.6 }])
  })

  it('propagates a failed source query as a hub error', async () => {
    const rows = hubRows()
    h.tables = { ...rows, merch_product_sales: { rows: [], error: { message: 'view missing' } } }

    const { getMerchHubData } = await import('@/components/merch/queries')
    const hub = await getMerchHubData(makeClient() as never, 'evt-1')

    expect(hub.error).toEqual({ message: 'view missing' })
  })
})
