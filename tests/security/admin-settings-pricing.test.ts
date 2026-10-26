import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/admin/settings PATCH — organizer subscription pricing validation.
 *
 * Writes go through the UPDATE path (migration 073 RLS: SELECT + UPDATE
 * only — an upsert's INSERT arm is denied and 500s), and the DB audit
 * trigger already logs platform_settings UPDATEs, so the app must NOT
 * double-write audit_log — asserted here.
 */

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))

const adminUser = { id: 'admin-1', app_metadata: { role: 'admin' } }
const runnerUser = { id: 'runner-1', app_metadata: {} }

// `.update(payload, { count: 'exact' }).eq('key', key)` chain; the eq
// result resolves to the update outcome.
const settingsEq = vi.fn(async () => ({ error: null, count: 1 }))
const settingsUpdate = vi.fn(() => ({ eq: settingsEq }))
const auditInsert = vi.fn()
const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn((table: string) => {
    if (table === 'platform_settings') return { update: settingsUpdate }
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
    expect(settingsUpdate).not.toHaveBeenCalled()
  })

  it('persists a valid price as a normalized MYR decimal object via UPDATE', async () => {
    const response = await settingsPATCH(
      req({ settings: { organizer_subscription_price: VALID } })
    )
    expect(response.status).toBe(200)
    const [payload, options] = settingsUpdate.mock.calls[0]
    expect(payload.value).toEqual(VALID)
    expect(payload.updated_by).toBe('admin-1')
    expect(options).toEqual({ count: 'exact' })
    // Targets the existing seeded row by key — never an INSERT-arm upsert.
    expect(settingsEq).toHaveBeenCalledWith('key', 'organizer_subscription_price')
  })

  it('rounds the amount to 2dp and keeps currency fixed MYR', async () => {
    await settingsPATCH(
      req({
        settings: { organizer_subscription_price: { ...VALID, amount: 49.999, period: 'month' } },
      })
    )
    const [payload] = settingsUpdate.mock.calls[0]
    expect(payload.value).toEqual({ amount: 50, currency: 'MYR', period: 'month', duration_days: 365 })
  })

  it('400s non-positive / sub-RM1 amounts and never writes', async () => {
    for (const bad of [0, -3.5, 'abc', undefined]) {
      const response = await settingsPATCH(
        req({ settings: { organizer_subscription_price: { ...VALID, amount: bad } } })
      )
      expect(response.status).toBe(400)
    }
    expect(settingsUpdate).not.toHaveBeenCalled()
  })

  it('400s fractional/non-positive duration_days', async () => {
    for (const bad of [0, 0.5, -10]) {
      const response = await settingsPATCH(
        req({ settings: { organizer_subscription_price: { ...VALID, duration_days: bad } } })
      )
      expect(response.status).toBe(400)
    }
    expect(settingsUpdate).not.toHaveBeenCalled()
  })

  it('404s an unknown non-pricing setting key cleanly (no RLS 500)', async () => {
    settingsEq.mockResolvedValueOnce({ error: null, count: 0 })
    const response = await settingsPATCH(
      req({ settings: { nonexistent_setting: true } })
    )
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Unknown setting key: nonexistent_setting')
  })

  it('404s the pricing key when the update matches 0 rows (not a 500)', async () => {
    settingsEq.mockResolvedValueOnce({ error: null, count: 0 })
    const response = await settingsPATCH(
      req({ settings: { organizer_subscription_price: VALID } })
    )
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toContain('Unknown setting key')
  })

  it('NO app-level audit double-write: platform_settings updates log only through the DB trigger', async () => {
    await settingsPATCH(req({ settings: { organizer_subscription_price: VALID } }))
    expect(settingsUpdate).toHaveBeenCalled()
    expect(auditInsert).not.toHaveBeenCalled()
  })
})
