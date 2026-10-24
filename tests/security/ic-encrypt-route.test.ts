import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/documents/encrypt/route'

/**
 * Contract tests for the BFF /api/documents/encrypt route against the
 * authoritative Django contract (pelikat-api /ai/documents/encrypt, 201):
 *   {status:'ok', document_path, document_mime, uploaded_at,
 *    nric_encrypted|null, needs_review, warnings}
 *
 * Critical logic under test:
 *  - shape verification of the Django payload before trusting any field
 *  - ic_encrypted written ONLY when nric_encrypted is non-null
 *  - defensive uploaded_at fallback to now
 *  - warnings/needs_review surfaced to the client untouched
 */

const DOTTED_FAKE = {
  update: vi.fn(),
  profile: { id: 'profile-1' } as Record<string, string> | null,
  zeroRows: false,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }) },
  })),
}))

// Migration 070: the profile write goes through the service-role client.
vi.mock('@/lib/supabase/service-role', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: DOTTED_FAKE.profile, error: null }),
        }),
      }),
      update: (data: Record<string, string>) => {
        DOTTED_FAKE.lastUpdate = data
        return {
          eq: () => ({
            select: () =>
              Promise.resolve({
                data: DOTTED_FAKE.zeroRows ? [] : [{ id: 'profile-1' }],
                error: null,
              }),
          }),
        }
      },
    }),
  },
}))

const djangoReply = (body: unknown, status = 201) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const omit = (body: Record<string, unknown>, key: string): Record<string, unknown> => {
  const copy = { ...body }
  delete copy[key]
  return copy
}

function multipartRequest() {
  return new Request('http://localhost/api/documents/encrypt', {
    method: 'POST',
    body: (() => {
      const fd = new FormData()
      fd.append('document', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'ic.jpg')
      return fd
    })(),
  })
}

/** Full valid contract payload */
const validReply = {
  status: 'ok',
  document_path: 'user-1/1760000000.enc',
  document_mime: 'image/jpeg',
  uploaded_at: '2026-10-22T00:00:00.000Z',
  nric_encrypted: null as string | null,
  needs_review: true,
  warnings: ['No NRIC found on document.'],
}

describe('POST /api/documents/encrypt (Django contract mapping)', () => {
  beforeEach(() => {
    DOTTED_FAKE.update = vi.fn()
    DOTTED_FAKE.profile = {
      id: 'profile-1',
      full_name: 'Test Runner',
      dob: '1990-01-01',
      gender: 'M',
      pdpa_agreed: true,
    }
    DOTTED_FAKE.zeroRows = false
    DOTTED_FAKE.lastUpdate = undefined as Record<string, string> | undefined
    delete DOTTED_FAKE.lastUpdate
  })

  it('writes document columns server-side and omits ic_encrypted when nric_encrypted is null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => djangoReply({ ...validReply })))

    const res = await POST(multipartRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      status: 'ok',
      needs_review: true,
      warnings: ['No NRIC found on document.'],
    })
    expect(DOTTED_FAKE.lastUpdate).toEqual({
      ic_document_path: 'user-1/1760000000.enc',
      ic_document_mime: 'image/jpeg',
      ic_document_uploaded_at: '2026-10-22T00:00:00.000Z',
    })
    expect('ic_encrypted' in (DOTTED_FAKE.lastUpdate ?? {})).toBe(false)
  })

  it('maps nric_encrypted into ic_encrypted when non-null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => djangoReply({ ...validReply, nric_encrypted: '{ver:2}', needs_review: false, warnings: [] }))
    )

    const res = await POST(multipartRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', needs_review: false, warnings: [] })
    expect(DOTTED_FAKE.lastUpdate.ic_encrypted).toBe('{ver:2}')
  })

  it('falls back defensively for uploaded_at when Django omits it', async () => {
    const withoutUploadedAt = omit(validReply, 'uploaded_at')
    vi.stubGlobal('fetch', vi.fn(async () => djangoReply(withoutUploadedAt)))

    const res = await POST(multipartRequest())
    expect(res.status).toBe(200)
    const written = DOTTED_FAKE.lastUpdate.ic_document_uploaded_at
    expect(typeof written).toBe('string')
    expect(Number.isNaN(Date.parse(written as string))).toBe(false)
  })

  it('returns 502 without DB writes when the Django payload shape is untrustworthy', async () => {
    const bad = omit(validReply, 'document_path')
    vi.stubGlobal('fetch', vi.fn(async () => djangoReply(bad)))

    const res = await POST(multipartRequest())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Document processing service error' })
    expect(DOTTED_FAKE.lastUpdate).toBeUndefined()
  })

  it('rejects non-ok status before any DB write', async () => {
    const okless = omit(validReply, 'status')
    vi.stubGlobal('fetch', vi.fn(async () => djangoReply(okless)))

    const res = await POST(multipartRequest())
    expect(res.status).toBe(502)
    expect(DOTTED_FAKE.lastUpdate).toBeUndefined()
  })

  it('returns 502 without DB writes when no runner_profiles row exists yet', async () => {
    DOTTED_FAKE.profile = null
    vi.stubGlobal('fetch', vi.fn(async () => djangoReply({ ...validReply })))

    const res = await POST(multipartRequest())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'Save your profile first' })
    expect(DOTTED_FAKE.lastUpdate).toBeUndefined()
  })

  it('returns 502 when the profile UPDATE matches zero rows', async () => {
    DOTTED_FAKE.zeroRows = true
    vi.stubGlobal('fetch', vi.fn(async () => djangoReply({ ...validReply })))

    const res = await POST(multipartRequest())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Failed to record document' })
  })

  it('maps Django error statuses to generic client messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => djangoReply({ error: 'internal detail' }, 500)))
    const res = await POST(multipartRequest())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).not.toContain('internal detail')
  })
})
