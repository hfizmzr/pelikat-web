import { describe, it, expect, vi, beforeEach } from 'vitest'
import { proxy } from '@/proxy'
import type { NextRequest } from 'next/server'

/**
 * Gate-brick regression tests (proxy runner profile-completion gate).
 *
 * Edge: OCR succeeds but extracts no NRIC → Django returns nric_encrypted:
 * null → the server-side route writes ic_document_path/mime/uploaded_at but
 * never ic_encrypted. The gate must accept the server-written document
 * evidence (ic_document_path) as satisfying the IC requirement, otherwise the
 * runner is permanently locked out of /runner routes with no review console.
 */

// Mock @supabase/ssr's createServerClient — proxy is the only consumer.
const state = {
  user: { id: 'user-1', app_metadata: {} } as never,
  profile: null as Record<string, unknown> | null,
}

const createServerClientMock = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))

function makeRequest(path: string): NextRequest {
  return {
    url: `http://localhost${path}`,
    nextUrl: new URL(`http://localhost${path}`),
    cookies: { getAll: () => [], set: () => {} },
  } as unknown as NextRequest
}

function bootstrapClient() {
  createServerClientMock.mockReturnValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user } })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profile }),
        }),
      }),
    })),
  })
}

const COMPLETE_BASE = {
  full_name: 'Runner Runner',
  dob: '1990-01-01',
  gender: 'M',
  phone: '0123456789',
  pdpa_agreed: true,
}

function requestRunner(path = '/runner/dashboard') {
  return proxy(makeRequest(path)).then((res) => ({
    redirected: res.headers.get('location')?.includes('/runner/profile') ?? false,
    status: res.status,
  }))
}

describe('runner profile gate accepts server-written IC evidence', () => {
  beforeEach(() => {
    state.user = { id: 'user-1', app_metadata: {} } as never
    state.profile = null
    bootstrapClient()
  })

  it('redirects to /runner/profile when the profile has no IC at all', async () => {
    state.profile = { ...COMPLETE_BASE, ic_encrypted: null, ic_document_path: null }
    const result = await requestRunner()
    expect(result.redirected).toBe(true)
  })

  it('passes when ic_encrypted is set (manual IC entry)', async () => {
    state.profile = { ...COMPLETE_BASE, ic_encrypted: '{v2:...}', ic_document_path: null }
    const result = await requestRunner()
    expect(result.redirected).toBe(false)
  })

  it('RED→FIX: passes on ic_document_path alone (OCR doc without extracted NRIC)', async () => {
    state.profile = { ...COMPLETE_BASE, ic_encrypted: null, ic_document_path: 'user-1/1.enc' }
    const result = await requestRunner()
    expect(result.redirected).toBe(false)
  })

  it('passes when both ic_encrypted and ic_document_path are set', async () => {
    state.profile = { ...COMPLETE_BASE, ic_encrypted: '{v2:...}', ic_document_path: 'user-1/1.enc' }
    const result = await requestRunner()
    expect(result.redirected).toBe(false)
  })

  it('always allows /runner/profile itself even with an empty profile', async () => {
    state.profile = null
    const result = await requestRunner('/runner/profile')
    expect(result.redirected).toBe(false)
  })

  it('redirects when other profile fields are incomplete even with IC evidence', async () => {
    state.profile = {
      full_name: '',
      dob: '1990-01-01',
      gender: 'M',
      phone: '0123456789',
      pdpa_agreed: true,
      ic_encrypted: null,
      ic_document_path: 'user-1/1.enc',
    }
    const result = await requestRunner()
    expect(result.redirected).toBe(true)
  })
})
