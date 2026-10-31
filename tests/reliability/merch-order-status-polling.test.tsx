import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// ── Hoisted mocks ───────────────────────────────────────────────
const h = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}))

// The merch_orders browser-client reads the order page's poll watches.
const supabaseState = vi.hoisted(() => {
  return {
    status: 'pending',
    reads: 0,
    maybeSingle: () => async () => {
      supabaseState.reads += 1
      return { data: { status: supabaseState.status }, error: null }
    },
  }
})

vi.mock('next/navigation', () => {
  // stable router object — Next.js returns one stable instance per
  // snapshot, and the poll effect depends on it
  const router = { push: h.push, replace: vi.fn(), back: vi.fn(), refresh: h.refresh }
  return { useRouter: () => router }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: supabaseState.maybeSingle() }) }),
    }),
  }),
}))

vi.mock('@/components/merch/store-actions', () => ({
  cancelMerchCheckout: vi.fn(),
  resumeMerchCheckout: vi.fn(),
}))

import { PendingOrderActions } from '@/components/merch/store/pending-order-actions'

function mount() {
  return render(
    <PendingOrderActions orderId="ord-1" eventId="evt-1" expiresAt="2100-01-01T00:00:00Z" />
  )
}

beforeEach(() => {
  supabaseState.status = 'pending'
  supabaseState.reads = 0
  h.refresh.mockClear()
  h.push.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('pending merch order status polling', () => {
  it('stops polling and re-renders server data once the status leaves pending', async () => {
    mount()
    expect(screen.getByText('Continue to payment')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(3000)
    // still pending → keep watching; no server rerender was triggered yet
    expect(supabaseState.reads).toBe(1)
    expect(h.refresh).not.toHaveBeenCalled()

    supabaseState.status = 'confirmed'
    await vi.advanceTimersByTimeAsync(3000)
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1))

    const readsAtConfirm = supabaseState.reads
    await vi.advanceTimersByTimeAsync(15000)
    // watcher stopped immediately after the webhook-updated status: no
    // extra reads, and the pending UI was never locally flipped
    expect(supabaseState.reads).toBe(readsAtConfirm)
    expect(h.refresh).toHaveBeenCalledTimes(1)
  })

  it('never flips the UI itself while the server still says pending', async () => {
    mount()
    for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(3000)
    // only the server render decides the UI — until it confirms, the
    // pending actions remain and no rerender is forced
    expect(screen.getByText('Continue to payment')).toBeInTheDocument()
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('caps at 10 attempts (no infinite polling)', async () => {
    mount()
    await vi.advanceTimersByTimeAsync(60000)
    expect(supabaseState.reads).toBe(10)
    expect(h.refresh).not.toHaveBeenCalled()
  })
})
