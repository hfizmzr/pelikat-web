// Covers: FR-48 (UC10 PDPA account deletion) — fail-closed ordering

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FR-48 (PDPA): account deletion + IC anonymization.
 *
 * deleteRunnerAccount contract:
 *  - documents are removed via Django FIRST, using the encrypted_path read
 *    from the runner's own profile row (never a client argument);
 *  - the profile is anonymized via the `anonymize_runner_profile` RPC with
 *    the DB-resolved runner id;
 *  - the Supabase auth user is deleted ONLY after both succeed (a failed
 *    anonymize must never orphan the auth logout before PII is scrubbed);
 *  - no profile row → refuse rather than half-delete.
 */

const mocks = {
  fetchDjangoApi: vi.fn(),
  profile: null as { id: string; ic_document_path: string | null } | null,
  rpc: vi.fn(),
  deleteUser: vi.fn(),
  redirect: vi.fn(),
}

vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => ({
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mocks.profile }),
          }),
        }),
      }),
      rpc: (...args: unknown[]) => mocks.rpc(...args),
    },
    user: { id: 'user-1' },
  }),
}))

vi.mock('@/lib/django', () => ({
  fetchDjangoApi: (...args: unknown[]) => mocks.fetchDjangoApi(...args),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  supabaseAdmin: {
    auth: { admin: { deleteUser: (...args: unknown[]) => mocks.deleteUser(...args) } },
  },
}))

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mocks.redirect(...args),
}))

const { deleteRunnerAccount } = await import('@/lib/actions/account')

describe('deleteRunnerAccount (FR-48: deletion + IC anonymization)', () => {
  beforeEach(() => {
    mocks.fetchDjangoApi = vi.fn()
    mocks.fetchDjangoApi.mockResolvedValue({ deleted: true })
    mocks.rpc = vi.fn().mockResolvedValue({ error: null })
    mocks.deleteUser = vi.fn().mockResolvedValue({ error: null })
    mocks.redirect = vi.fn()
    mocks.profile = { id: 'profile-1', ic_document_path: 'user-1/123.enc' }
  })

  it('removes the IC document (DB-resolved path) → anonymizes → deletes auth user → redirects, in that order', async () => {
    await deleteRunnerAccount()

    expect(mocks.fetchDjangoApi).toHaveBeenCalledWith(
      '/ai/documents/delete',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"encrypted_path":"user-1/123.enc"') as string,
      })
    )
    expect(mocks.rpc).toHaveBeenCalledWith('anonymize_runner_profile', {
      p_runner_id: 'profile-1',
    })
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1')
    expect(mocks.redirect).toHaveBeenCalledWith('/goodbye')

    // Order is the PDPA guarantee: PII scrubbed before auth deletion.
    const django = mocks.fetchDjangoApi.mock.invocationCallOrder[0]
    const anonymize = mocks.rpc.mock.invocationCallOrder[0]
    const auth = mocks.deleteUser.mock.invocationCallOrder[0]
    const goodbye = mocks.redirect.mock.invocationCallOrder[0]
    expect(django).toBeLessThan(anonymize)
    expect(anonymize).toBeLessThan(auth)
    expect(auth).toBeLessThan(goodbye)
  })

  it('skips the Django document call when the profile has no IC document, but still anonymizes', async () => {
    mocks.profile = { id: 'profile-1', ic_document_path: null }

    await deleteRunnerAccount()

    expect(mocks.fetchDjangoApi).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('anonymize_runner_profile', { p_runner_id: 'profile-1' })
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-1')
  })

  it('refuses to run anything when there is no profile row', async () => {
    mocks.profile = null

    await expect(deleteRunnerAccount()).rejects.toThrow(/profile not found/i)
    expect(mocks.fetchDjangoApi).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('never deletes the auth user when anonymization fails (PII scrubbed first, always)', async () => {
    mocks.rpc = vi.fn().mockResolvedValue({ error: { message: 'rpc boom' } })

    await expect(deleteRunnerAccount()).rejects.toThrow(/anonymize failed/i)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('never redirects when auth-user deletion fails after anonymization', async () => {
    mocks.deleteUser = vi.fn().mockResolvedValue({ error: { message: 'auth boom' } })

    await expect(deleteRunnerAccount()).rejects.toThrow(/delete auth user failed/i)
    expect(mocks.rpc).toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
