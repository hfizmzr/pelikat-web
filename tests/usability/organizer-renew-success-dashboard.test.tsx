import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// ── Hoisted mocks ───────────────────────────────────────────────
const h = vi.hoisted(() => {
  const push = vi.fn()
  const refresh = vi.fn()
  const refreshSession = vi.fn(async () => ({ data: {}, error: null }))
  // exact call order between the session re-stamp and the navigation
  const authOrder: string[] = []
  return { push, refresh, refreshSession, authOrder }
})

const push = h.push
const refreshSession = h.refreshSession

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (path: string) => {
      h.authOrder.push(`push:${path}`)
      return push(path)
    },
    replace: vi.fn(),
    back: vi.fn(),
    refresh: h.refresh,
  }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'u-1', app_metadata: { role: 'organizer', organizer_id: 'org-1' } } },
      }),
      // the access-token hook re-stamps the role from the DB here
      refreshSession: async () => {
        h.authOrder.push('refreshSession')
        return refreshSession()
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 'org-1',
              name: 'Pelikat Org',
              slug: 'pelikat-org',
              contact_email: null,
              // future expiry → the page renders the success card directly
              sub_expires_at: '2100-01-01T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/payments/mock', () => ({
  createCheckout: vi.fn(),
  confirmPayment: vi.fn(),
  getPaymentProvider: () => 'hitpay',
}))

vi.mock('@/components/events/actions', () => ({
  createHitpaySubscriptionCheckout: vi.fn(),
}))

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })))

import OrganizerPaymentPage from '@/app/organizer/payment/page'

beforeEach(() => {
  h.push.mockClear()
  h.refresh.mockClear()
  refreshSession.mockClear()
  h.authOrder.length = 0
})
afterEach(() => cleanup())

describe('post-renewal Go-to-Dashboard session refresh', () => {
  it('refreshes the session BEFORE pushing /organizer (stale expired role is re-stamped first)', async () => {
    render(<OrganizerPaymentPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Go to Dashboard/i }))

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/organizer')
      expect(h.refresh).toHaveBeenCalled()
    })
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(h.authOrder).toEqual(['refreshSession', 'push:/organizer'])
  })

  it('double-clicks during the refresh do not double-push', async () => {
    render(<OrganizerPaymentPage />)

    const button = await screen.findByRole('button', { name: /Go to Dashboard/i })
    fireEvent.click(button)
    // the button switches to its guarded "Starting…" state while the
    // first navigation is still resolving
    await screen.findByRole('button', { name: /Starting…/i })

    await waitFor(() => expect(push).toHaveBeenCalledWith('/organizer'))
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it('a failed refreshSession surfaces the error and skips navigation', async () => {
    refreshSession.mockResolvedValueOnce({ data: {}, error: { message: 'Refresh Token Not Found' } })
    render(<OrganizerPaymentPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Go to Dashboard/i }))

    await screen.findByText('Refresh Token Not Found')
    expect(push).not.toHaveBeenCalled()
    expect(h.refresh).not.toHaveBeenCalled()
    // the guard clears so the user can retry the navigation
    await screen.findByRole('button', { name: /Go to Dashboard/i })
  })
})
