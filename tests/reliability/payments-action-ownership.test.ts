import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ─────────────────────────────────────────────
const { requireAuth, supabaseRpc, fromCalls } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  supabaseRpc: vi.fn(),
  fromCalls: [] as string[],
}))

vi.mock('@/lib/auth/requireUser', () => ({ requireAuth }))
vi.mock('@/lib/supabase/service-role', () => ({
  supabaseAdmin: { rpc: supabaseRpc },
}))
vi.mock('@/lib/payments', () => ({
  getServerPaymentProvider: vi.fn(() => 'mock'),
}))

// Caller JWT client: selectable tables return rows per fixture map.
const tableRows: Record<string, unknown[]> = {}
function callerSupabase() {
  return {
    from: (table: string) => {
      fromCalls.push(table)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: (tableRows[table] || [])[0] ?? null,
            }),
          }),
        }),
      }
    },
  }
}

import { confirmDummyPayment } from '@/lib/actions/payments'

const USER = { id: 'auth-user-1' }
const RUNNER_ID = 'runner-uuid-1'

function seedOwned(runnerId = RUNNER_ID) {
  tableRows['runner_profiles'] = [{ id: runnerId }]
  tableRows['registrations'] = [{ runner_id: runnerId }]
}

describe('Reliability: confirmDummyPayment ownership guard (061 contract)', () => {
  beforeEach(() => {
    fromCalls.length = 0
    tableRows.runner_profiles = []
    tableRows.registrations = []
    requireAuth.mockReset()
    supabaseRpc.mockReset()
    requireAuth.mockResolvedValue({ supabase: callerSupabase(), user: USER })
    supabaseRpc.mockResolvedValue({ error: null })
  })

  it('throws when the registration is not owned by the caller (runner mismatch)', async () => {
    tableRows['runner_profiles'] = [{ id: 'runner-uuid-1' }]
    tableRows['registrations'] = [{ runner_id: 'runner-uuid-OTHER' }]
    await expect(confirmDummyPayment('reg-uuid-1')).rejects.toThrow(
      'Not your registration'
    )
    expect(supabaseRpc).not.toHaveBeenCalled()
  })

  it('throws when the caller has no runner profile', async () => {
    tableRows['runner_profiles'] = []
    tableRows['registrations'] = [{ runner_id: 'someone-else' }]
    await expect(confirmDummyPayment('reg-uuid-1')).rejects.toThrow(
      'Not your registration'
    )
    expect(supabaseRpc).not.toHaveBeenCalled()
  })

  it('calls the RPC for an owned registration', async () => {
    seedOwned()
    await confirmDummyPayment('reg-uuid-1')
    expect(supabaseRpc).toHaveBeenCalledWith('confirm_dummy_payment', {
      p_registration_id: 'reg-uuid-1',
    })
  })

  it('guards provider first: non-mock provider rejects before any auth/DB work', async () => {
    const { getServerPaymentProvider } = await import('@/lib/payments')
    ;(getServerPaymentProvider as ReturnType<typeof vi.fn>).mockReturnValue('hitpay')
    await expect(confirmDummyPayment('reg-uuid-1')).rejects.toThrow(
      /PAYMENT_PROVIDER/
    )
    expect(requireAuth).not.toHaveBeenCalled()
    expect(fromCalls).toEqual([])
    ;(getServerPaymentProvider as ReturnType<typeof vi.fn>).mockReturnValue('mock')
  })
})
