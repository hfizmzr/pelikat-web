import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROFILE_INCOMPLETE_MESSAGE } from '@/lib/profile-validation'

/**
 * Server-action mirror of the client-side profile save/precondition checks:
 * never trust client JS — the action must re-derive the preconditions from
 * the DB profile row before accepting an IC.
 */

const mocks = {
  requireAuth: vi.fn(),
  supabaseAdminFromNoRows: false,
}

// requireAuth's supabase resolves profile rows for the CURRENT DB state.
vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => mocks.requireAuth(),
}))

vi.mock('@/lib/django', () => ({
  fetchDjangoApi: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}))

vi.mock('@/lib/supabase/service-role', () => ({
  supabaseAdmin: {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () =>
            Promise.resolve(
              mocks.supabaseAdminFromNoRows
                ? { data: [], error: null }
                : { data: [{ id: 'profile-1' }], error: null }
            ),
        }),
      }),
    }),
  },
}))

const { storeEncryptedIc } = await import('@/lib/actions/account')
const { profileSaveErrors } = await import('@/lib/profile-validation')

const authWithProfile = (row: Record<string, unknown> | null) =>
  vi.fn(async () => ({
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row }),
          }),
        }),
      }),
    },
    user: { id: 'user-1' },
  }))

describe('storeEncryptedIc profile preconditions (backend authority)', () => {
  beforeEach(() => {
    mocks.supabaseAdminFromNoRows = false
  })

  it('rejects when the SAVED profile has a blank full_name', async () => {
    mocks.requireAuth = authWithProfile({
      full_name: '',
      dob: '1990-01-01',
      gender: 'M',
      pdpa_agreed: true,
    })
    await expect(storeEncryptedIc('010101-14-5123')).rejects.toThrow(
      PROFILE_INCOMPLETE_MESSAGE
    )
  })

  it('rejects when PDPA consent was never agreed on the saved profile', async () => {
    mocks.requireAuth = authWithProfile({
      full_name: 'Ali Bin Abu',
      dob: '1990-01-01',
      gender: 'M',
      pdpa_agreed: false,
    })
    await expect(storeEncryptedIc('010101-14-5123')).rejects.toThrow(
      PROFILE_INCOMPLETE_MESSAGE
    )
  })

  it('accepts a complete saved profile', async () => {
    mocks.requireAuth = authWithProfile({
      full_name: 'Ali Bin Abu',
      dob: '1990-01-01',
      gender: 'M',
      pdpa_agreed: true,
    })
    const { fetchDjangoApi } = await import('@/lib/django')
    ;(fetchDjangoApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'ok',
      ic_encrypted: '{ver:2}',
      needs_review: false,
      warnings: [],
    })

    const result = await storeEncryptedIc('010101-14-5123')
    expect(result).toEqual({ needs_review: false, warnings: [] })
  })

  it('mirrors the client save validation rules at the action layer', async () => {
    // Same rules the client applies before its own save call — keep them in
    // lockstep if either side changes.
    expect(profileSaveErrors('  ', false)).toMatchObject({
      full_name: expect.any(String),
      pdpa: expect.any(String),
    })
    expect(profileSaveErrors('Ali Bin Abu', true)).toEqual({})
  })
})
