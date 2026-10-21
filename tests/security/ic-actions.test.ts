import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Server-action behavior pins for the IC pipeline:
 *  - storeEncryptedIc contract handling (backend dict {"status","ic_encrypted",
 *    "needs_review","warnings"}); a legacy/poisoned {"nric_encrypted"} shape
 *    must never result in a profile write of `undefined`.
 *  - dob/gender pass-through enabling the Django NRIC cross-check.
 *  - deleteDocument must resolve encrypted_path from the DATABASE, never from
 *    a client-supplied argument (CWE-459 stale-id drift).
 */

const mocks = {
  fetchDjangoApi: vi.fn(),
  update: vi.fn(),
  withArgs: undefined as Record<string, string> | undefined,
  select: vi.fn(),
}

vi.mock('@/lib/auth/requireUser', () => ({
  requireAuth: async () => ({
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mocks.select() }),
          }),
        }),
      }),
    },
    user: { id: 'user-1' },
  }),
}))

vi.mock('@/lib/django', () => ({
  fetchDjangoApi: (...args: unknown[]) => mocks.fetchDjangoApi(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}))

// Migration 070: profile writes go through the service-role client.
vi.mock('@/lib/supabase/service-role', () => ({
  supabaseAdmin: {
    auth: { admin: {} },
    from: () => ({
      update: (data: Record<string, string>) => {
        mocks.withArgs = data
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  },
}))

const { storeEncryptedIc, deleteDocument } = await import('@/lib/actions/account')

describe('storeEncryptedIc', () => {
  beforeEach(() => {
    mocks.fetchDjangoApi = vi.fn()
    mocks.withArgs = undefined
  })

  it('encrypts and writes the Django ic_encrypted ciphertext; returns review info', async () => {
    mocks.fetchDjangoApi.mockResolvedValue({
      status: 'ok',
      ic_encrypted: '{ver:2}',
      needs_review: true,
      warnings: ['Passport number accepted on format only.'],
    })

    const result = await storeEncryptedIc('A1234567')

    expect(mocks.fetchDjangoApi).toHaveBeenCalledWith(
      '/ai/documents/encrypt-ic',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"user_id":"user-1"') as string,
      })
    )
    expect(mocks.withArgs).toEqual({ ic_encrypted: '{ver:2}' })
    expect(result).toEqual({
      needs_review: true,
      warnings: ['Passport number accepted on format only.'],
    })
  })

  it('passes optional profile dob/gender for the backend NRIC cross-check', async () => {
    mocks.fetchDjangoApi.mockResolvedValue({ ic_encrypted: '{v2}', needs_review: false, warnings: [] })

    await storeEncryptedIc('010101-14-5123', { dob: '2001-01-01', gender: 'F' })

    const body = JSON.parse(mocks.fetchDjangoApi.mock.calls[0][1].body as string) as Record<string, string>
    expect(body.dob).toBe('2001-01-01')
    expect(body.gender).toBe('F')
  })

  it('omits dob/gender keys when not provided', async () => {
    mocks.fetchDjangoApi.mockResolvedValue({ ic_encrypted: '{v2}' })
    await storeEncryptedIc('010101-14-5123')
    const body = JSON.parse(mocks.fetchDjangoApi.mock.calls[0][1].body as string) as Record<string, unknown>
    expect('dob' in body).toBe(false)
    expect('gender' in body).toBe(false)
  })

  it('throws and never writes when Django answers without an ic_encrypted ciphertext (renamed/legacy shape)', async () => {
    mocks.fetchDjangoApi.mockResolvedValue({ status: 'ok', nric_encrypted: '{ver:2}' })

    await expect(storeEncryptedIc('A1234567')).rejects.toThrow(/unexpected response/i)
    expect(mocks.withArgs).toBeUndefined()
  })

  it('throws and never writes when Django answers without any ciphertext field', async () => {
    mocks.fetchDjangoApi.mockResolvedValue({ status: 'ok' })
    await expect(storeEncryptedIc('A1234567')).rejects.toThrow(/unexpected response/i)
    expect(mocks.withArgs).toBeUndefined()
  })
})

describe('deleteDocument', () => {
  beforeEach(() => {
    mocks.fetchDjangoApi = vi.fn()
    mocks.fetchDjangoApi.mockResolvedValue({ deleted: true })
    mocks.withArgs = undefined
  })

  it('resolves the encrypted path from the database — not from client arguments', async () => {
    mocks.select.mockReturnValue({ ic_document_path: 'user-1/123.enc' })

    await deleteDocument()

    expect(mocks.fetchDjangoApi).toHaveBeenCalledWith(
      '/ai/documents/delete',
      expect.objectContaining({
        body: expect.stringContaining('"encrypted_path":"user-1/123.enc"') as string,
      })
    )
    expect(mocks.withArgs).toEqual({
      ic_document_path: null,
      ic_document_mime: null,
      ic_document_uploaded_at: null,
    })
  })

  it('skips Django deletion when the profile row has no document', async () => {
    mocks.select.mockReturnValue({ ic_document_path: null })

    await deleteDocument()

    expect(mocks.fetchDjangoApi).not.toHaveBeenCalled()
    expect(mocks.withArgs).toEqual(expect.objectContaining({ ic_document_path: null }))
  })
})
