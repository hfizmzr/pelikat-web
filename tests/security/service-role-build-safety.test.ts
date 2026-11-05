/**
 * Build-safety regression for the docker `next build` crash: service-role.ts
 * used to call createClient at module load, so page-data collection (which
 * imports it via /events/[slug] → safe-name) threw "supabaseKey is required."
 * in the Dockerfile.prod builder stage that receives only the NEXT_PUBLIC_*
 * build-args. The module is now a lazy Proxy; these tests pin the contract:
 * import is always safe, first access builds exactly once, missing key fails
 * loudly at access time (no silent fallback to the public client).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const createClient = vi.hoisted(() => vi.fn(() => ({ from: () => ({}) })))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

const importServiceRole = () => import('@/lib/supabase/service-role')

beforeEach(() => {
  // Fresh module instance per test — the real client cache is module-level.
  vi.resetModules()
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  createClient.mockClear()
})

describe('Security: service-role build-time safety', () => {
  it('import does not throw at module load when SUPABASE_SERVICE_ROLE_KEY is unset (build-time safe)', async () => {
    await expect(importServiceRole()).resolves.toBeTruthy()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('first property access builds the real client exactly once', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-test-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    const { supabaseAdmin } = await importServiceRole()

    void supabaseAdmin.from
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'secret-test-key')

    void supabaseAdmin.from
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('first property access throws loudly when the key is missing (no silent fallback)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    const { supabaseAdmin } = await importServiceRole()

    expect(() => void supabaseAdmin.from).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY not set (admin-first access at runtime)',
    )
    expect(createClient).not.toHaveBeenCalled()
  })
})
