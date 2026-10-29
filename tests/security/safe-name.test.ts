/**
 * P3 Task 4: safeOrganizerName — service-role organizer-name recovery used by
 * runner pages AFTER the event row's visibility gate. The helper's own
 * contract (degrade to null on any failure/empty input) is unit-tested here;
 * the "never called before visibility" ORDER is pinned at the page level
 * (tests/theme/runner-event-page.test.tsx: draft → notFound throws before the
 * service access wrapper is ever awaited).
 *
 * The service-role module ('server-only') is mocked out — tests must not
 * construct a real Supabase client; safe-name takes any SupabaseClient anyway.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { safeOrganizerName, fetchOrganizerName } from '@/lib/supabase/safe-name'

const adminFetch = vi.hoisted(() => ({
  respond: vi.fn(async () => ({ data: null, error: null })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => adminFetch.respond(),
        }),
      }),
    }),
  },
}))

/** Minimal chainable mock of the only query safeOrganizerName can make. */
function fakeSupabase(
  row: { name?: string } | null,
  error: unknown = null,
  behavior: 'row-error' | 'throw' | 'normal' = 'normal',
): SupabaseClient {
  let queryCalls = 0
  const client = {
    from: () => {
      queryCalls += 1
      return {
        select: () => {
          if (behavior === 'throw') throw new Error('network')
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: row, error }),
            }),
          }
        },
      }
    },
  }
  void queryCalls
  return client as unknown as SupabaseClient
}

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('safeOrganizerName', () => {
  it('resolves the organizer name through the passed client', async () => {
    await expect(safeOrganizerName(fakeSupabase({ name: 'Klub Batik Heritage' }), ID)).resolves.toBe(
      'Klub Batik Heritage',
    )
  })

  it('service fetch fails (row error) → null (caller keeps its fallback copy)', async () => {
    await expect(
      safeOrganizerName(fakeSupabase(null, new Error('boom'), 'row-error'), ID),
    ).resolves.toBeNull()
  })

  it('client throws → null, never propagates', async () => {
    await expect(safeOrganizerName(fakeSupabase(null, null, 'throw'), ID)).resolves.toBeNull()
  })

  it('no row / empty / whitespace name → null', async () => {
    expect(await safeOrganizerName(fakeSupabase(null), ID)).toBeNull()
    expect(await safeOrganizerName(fakeSupabase({ name: '' }), ID)).toBeNull()
    expect(await safeOrganizerName(fakeSupabase({ name: '   ' }), ID)).toBeNull()
  })

  it('falsy/missing organizer id → null WITHOUT any service query', async () => {
    const spy = vi.fn(() => ({ select: () => ({}) }))
    const client = { from: spy } as unknown as SupabaseClient
    for (const id of [null, undefined, '']) {
      expect(await safeOrganizerName(client, id)).toBeNull()
    }
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('fetchOrganizerName (service-role binding, P3 Task 4)', () => {
  it('delegates to safeOrganizerName with the service-role client', async () => {
    adminFetch.respond.mockResolvedValueOnce({ data: { name: 'Klub Batik Heritage' }, error: null })
    await expect(fetchOrganizerName(ID)).resolves.toBe('Klub Batik Heritage')
    expect(adminFetch.respond).toHaveBeenCalledTimes(1)
  })

  it('null organizer id → no service-role read at all', async () => {
    adminFetch.respond.mockClear()
    await expect(fetchOrganizerName(null)).resolves.toBeNull()
    expect(adminFetch.respond).not.toHaveBeenCalled()
  })
})
