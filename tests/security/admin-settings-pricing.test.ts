import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/admin/settings PATCH — organizer subscription pricing validation.
 *
 * The DB audit trigger (migration 073) already logs platform_settings
 * UPDATEs, so the app must NOT double-write audit_log — asserted here.
 */

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))

const adminUser = { id: 'admin-1', app_metadata: { role: 'admin' } }
const runnerUser = { id: 'runner-1', app_metadata: {} }

const settingsUpsert = vi.fn(async () => ({ error: null }))
const auditInsert = vi.fn()
const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn((table: string) => {
    if (table === 'platform_settings') return { upsert: settingsUpsert }
    if (table === 'audit_log') return { insert: auditInsert }
    throw new Error(`unexpected table ${table}`)
  }),
}

import { PATCH as settingsPATCH } from '@/app/api/admin/settings/route'

const req = (body: unknown) =>
  new Request('http://localhost/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

const VALID = {
  amount: 149.5,
  currency: 'MYR',
  period: 'year',
  duration_days: 365,
}

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue(mockSupabase)
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: adminUser } })
})

describe('Security: /api/admin/settings PATCH pricing', () => {
  it('403s a non-admin caller before any write', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: runnerUser } })
    const response = await settingsPATCH(
      req({ settings: { organizer_subscription_price: VALID } })
    )
    expect(response.status).toBe(403)
    expect(settingsUpsert).not.toHaveBeenCalled()
  })

  it('persists a valid price as a normalized MYR decimal object', async () => {
    const response = await settingsPATCH(
      req({ settings: { organizer_subscription_price: VALID } })
    )
    expect(response.status).toBe(200)
    const [row] = settingsUpsert.mock.calls[0]
    expect(row.key).toBe('organizer_subscription_price')
    expect(row.value).toEqual(VALID)
    expect(row.updated_by).toBe('admin-1')
  })

  it('rounds the amount to 2dp and keeps currency fixed MYR', async () => {
    await settingsPATCH(
      req({
        settings: { organizer_subscription_price: { ...VALID, amount: 49.999, period: 'month' } },
      })
    )
    const [row] = settingsUpsert.mock.calls[0]
    expect(row.value).toEqual({ amount: 50, currency: 'MYR', period: 'month', duration_days: 365 })
  })

  it('400s non-positive / sub-RM1 amounts and never writes', async () => {
    for (const bad of [0, -3.5, 'abc', undefined]) {
      const response = await settingsPATCH(
        req({ settings: { organizer_subscription_price: { ...VALID, amount: bad } } })
      )
      expect(response.status).toBe(400)
    }
    expect(settingsUpsert).not.toHaveBeenCalled()
  })

  it('400s fractional/non-positive duration_days', async () => {
    for (const bad of [0, 0.5, -10]) {
      const response = await settingsPATCH(
        req({ settings: { organizer_subscription_price: { ...VALID, duration_days: bad } } })
      )
      expect(response.status).toBe(400)
    }
    expect(settingsUpsert).not.toHaveBeenCalled()
  })

  it('NO app-level audit double-write: platform_settings updates log only through the DB trigger', async () => {
    await settingsPATCH(req({ settings: { organizer_subscription_price: VALID } }))
    expect(settingsUpsert).toHaveBeenCalled()
    expect(auditInsert).not.toHaveBeenCalled()
  })
})
