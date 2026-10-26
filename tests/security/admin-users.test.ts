import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/admin/users — admin account management route guards.
 *
 * The admin layout is a client-side-only barrier; this route is the real
 * wall. Covers: RBAC (403 for non-admins), the self-demotion guard
 * (DELETE userId === caller → 400), grant/revoke idempotency and the
 * admin_role_granted / admin_role_revoked audit writes.
 */

const { createClient, supabaseAdmin } = vi.hoisted(() => ({
  createClient: vi.fn(),
  supabaseAdmin: {
    auth: {
      admin: {
        listUsers: vi.fn(),
        getUserById: vi.fn(),
        updateUserById: vi.fn(),
        createUser: vi.fn(),
        inviteUserByEmail: vi.fn(),
      },
    },
  },
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/supabase/service-role', () => ({ supabaseAdmin }))

// Real logAudit so the test asserts actual audit_log inserts on the
// request-scoped client (same pattern as the ic-actions security tests).
const adminUser = {
  id: 'admin-1',
  email: 'root@pelikat.com',
  app_metadata: { role: 'admin' },
  user_metadata: { full_name: 'Root Admin' },
}
const mockSupabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user: adminUser } })) },
  from: vi.fn(() => auditInsert),
}
const auditInsert = { insert: vi.fn(async () => ({ error: null })) }

function authUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'u-1@example.com',
    created_at: '2026-01-01T00:00:00Z',
    last_sign_in_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

import {
  GET as usersGET,
  POST as usersPOST,
  DELETE as usersDELETE,
} from '@/app/api/admin/users/route'

const req = (method: string, body: unknown) =>
  new Request('http://localhost/api/admin/users', {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(() => {
  vi.clearAllMocks()
  createClient.mockResolvedValue(mockSupabase)
  // clearAllMocks resets mockResolvedValueOnce queues but also wipes
  // permanent implementations set mid-suite — re-anchor the default caller.
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: adminUser } })
  // listUsers default: everything found on page 1 (perPage not exceeded).
  supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
    data: { users: [{ ...adminUser, created_at: '2025-06-01T00:00:00Z', last_sign_in_at: null }] },
    error: null,
  })
})

describe('Security: /api/admin/users — RBAC', () => {
  it('403s a non-admin caller and skips all admin API activity (GET)', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'u-9', email: 'x@x.com', app_metadata: {} } },
    })
    const response = await usersGET()
    expect(response.status).toBe(403)
    expect(supabaseAdmin.auth.admin.listUsers).not.toHaveBeenCalled()
  })

  it('403s a non-admin caller on POST and DELETE', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u-9', email: 'x@x.com', app_metadata: {} } },
    })
    expect((await usersPOST(req('POST', { email: 'a@b.com', mode: 'promote' }))).status).toBe(403)
    expect((await usersDELETE(req('DELETE', { userId: 'admin-1' }))).status).toBe(403)
  })

  it('401s an anonymous caller', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await usersGET()).status).toBe(401)
  })
})

describe('Security: /api/admin/users — GET list', () => {
  it('returns only users whose app_metadata.role is admin', async () => {
    supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
      data: {
        users: [
          authUser({ id: 'admin-1', email: 'root@pelikat.com', app_metadata: { role: 'admin' } }),
          authUser({ id: 'runner-1', email: 'r@example.com', app_metadata: {} }),
          authUser({ id: 'org-1', email: 'o@example.com', app_metadata: { role: 'organizer', organizer_id: 'oid' } }),
        ],
      },
      error: null,
    })
    const response = await usersGET()
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.users).toHaveLength(1)
    expect(json.users[0]).toMatchObject({ id: 'admin-1', email: 'root@pelikat.com' })
    expect(Object.keys(json.users[0]).sort()).toEqual(
      ['created_at', 'email', 'id', 'last_sign_in_at'].sort()
    )
  })
})

describe('Security: /api/admin/users — POST grant', () => {
  it("promote: sets app_metadata.role='admin' by id and writes admin_role_granted to audit_log", async () => {
    supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
      data: { users: [authUser({ id: 'target-1', email: 'target@pelikat.com', app_metadata: {} })] },
      error: null,
    })
    supabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
      data: { user: authUser({ id: 'target-1', email: 'target@pelikat.com', app_metadata: { role: 'admin' } }) },
      error: null,
    })

    const response = await usersPOST(req('POST', { email: 'target@pelikat.com', mode: 'promote' }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.alreadyAdmin).toBe(false)

    const [userId, updates] = supabaseAdmin.auth.admin.updateUserById.mock.calls[0]
    expect(userId).toBe('target-1')
    expect(updates).toEqual({ app_metadata: { role: 'admin' } })

    expect(auditInsert.insert).toHaveBeenCalledTimes(1)
    const [row] = auditInsert.insert.mock.calls[0]
    expect(row.action).toBe('admin_role_granted')
    expect(row.target_id).toBe('target-1')
    expect(row.metadata.mode).toBe('promote')
  })

  it("promote of an unknown email 404s with the 'invite' hint and performs no writes", async () => {
    supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    })
    const response = await usersPOST(req('POST', { email: 'ghost@pelikat.com', mode: 'promote' }))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toMatch(/invite/i)
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(auditInsert.insert).not.toHaveBeenCalled()
  })

  it('is idempotent: granting an already-admin via promote returns the existing state with no duplicate action', async () => {
    const response = await usersPOST(req('POST', { email: 'root@pelikat.com', mode: 'promote' }))
    expect(response.status).toBe(200)
    expect((await response.json()).alreadyAdmin).toBe(true)
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(supabaseAdmin.auth.admin.createUser).not.toHaveBeenCalled()
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
    expect(auditInsert.insert).not.toHaveBeenCalled()
  })

  it('invite-mode retry on an already-admin re-sends the invitation (resend is the recovery path)', async () => {
    supabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: adminUser },
      error: null,
    })
    const response = await usersPOST(req('POST', { email: 'root@pelikat.com', mode: 'invite' }))
    expect(response.status).toBe(200)
    expect((await response.json()).alreadyAdmin).toBe(true)
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('root@pelikat.com')
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(auditInsert.insert).not.toHaveBeenCalled()
  })

  it('invite-mode retry on an unconfirmed already-admin re-sends the invitation (resend is the recovery path)', async () => {
    supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
      data: {
        users: [
          { ...adminUser, email_confirmed_at: null, last_sign_in_at: null },
        ],
      },
      error: null,
    })
    supabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: adminUser },
      error: null,
    })
    const response = await usersPOST(req('POST', { email: 'root@pelikat.com', mode: 'invite' }))
    expect(response.status).toBe(200)
    expect((await response.json()).alreadyAdmin).toBe(true)
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('root@pelikat.com')
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(auditInsert.insert).not.toHaveBeenCalled()
  })

  it('invite-mode retry on a confirmed already-admin makes no invite call and returns a clean alreadyAdmin 200', async () => {
    supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
      data: {
        users: [
          {
            ...adminUser,
            email_confirmed_at: '2025-06-02T00:00:00Z',
            created_at: '2025-06-01T00:00:00Z',
          },
        ],
      },
      error: null,
    })
    const response = await usersPOST(req('POST', { email: 'root@pelikat.com', mode: 'invite' }))
    expect(response.status).toBe(200)
    expect((await response.json())).toMatchObject({ success: true, alreadyAdmin: true })
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled()
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(auditInsert.insert).not.toHaveBeenCalled()
  })

  it('invite of a new user audits admin_role_granted even when the invite email fails', async () => {
    supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    })
    supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: authUser({ id: 'new-admin-2', email: 'fresh2@pelikat.com', app_metadata: { role: 'admin' } }) },
      error: null,
    })
    supabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'SMTP unavailable' },
    })

    const response = await usersPOST(req('POST', { email: 'fresh2@pelikat.com', mode: 'invite' }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.alreadyAdmin).toBe(true)
    expect(json.message).toMatch(/invitation email failed: SMTP unavailable/i)

    // The role grant is the audited fact — it must fire before/at creation,
    // not only on successful email delivery.
    expect(auditInsert.insert).toHaveBeenCalledTimes(1)
    expect(auditInsert.insert.mock.calls[0][0].action).toBe('admin_role_granted')
    expect(auditInsert.insert.mock.calls[0][0].target_id).toBe('new-admin-2')
    expect(auditInsert.insert.mock.calls[0][0].metadata.mode).toBe('invite')
  })

  it("invite of a new email creates the user with the admin role then sends the invite, audited once", async () => {
    supabaseAdmin.auth.admin.listUsers.mockResolvedValue({
      data: { users: [adminUser] },
      error: null,
    })
    supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: authUser({ id: 'new-admin-1', email: 'fresh@pelikat.com', app_metadata: { role: 'admin' } }) },
      error: null,
    })
    supabaseAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
      data: { user: authUser({ id: 'new-admin-1' }) },
      error: null,
    })

    const response = await usersPOST(req('POST', { email: 'fresh@pelikat.com', mode: 'invite' }))
    expect(response.status).toBe(200)

    const [created] = supabaseAdmin.auth.admin.createUser.mock.calls[0]
    expect(created).toEqual({ email: 'fresh@pelikat.com', app_metadata: { role: 'admin' } })
    expect(supabaseAdmin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('fresh@pelikat.com')

    expect(auditInsert.insert).toHaveBeenCalledTimes(1)
    expect(auditInsert.insert.mock.calls[0][0].action).toBe('admin_role_granted')
    expect(auditInsert.insert.mock.calls[0][0].metadata.mode).toBe('invite')
  })

  it('rejects a malformed email or unknown mode with 400', async () => {
    expect((await usersPOST(req('POST', { email: 'not-an-email', mode: 'promote' }))).status).toBe(400)
    expect((await usersPOST(req('POST', { email: 'a@b.com', mode: 'delete-everything' }))).status).toBe(400)
  })
})

describe('Security: /api/admin/users — DELETE revoke', () => {
  it('400s on self-demotion (userId === caller id) with no update and no audit', async () => {
    const response = await usersDELETE(req('DELETE', { userId: 'admin-1' }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/your own admin role/i)
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(auditInsert.insert).not.toHaveBeenCalled()
  })

  it('400s when the target account is not an admin', async () => {
    supabaseAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: authUser({ id: 'runner-1', app_metadata: {} }) },
      error: null,
    })
    const response = await usersDELETE(req('DELETE', { userId: 'runner-1' }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/not an admin/i)
    expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled()
    expect(auditInsert.insert).not.toHaveBeenCalled()
  })

  it("revokes by reverting app_metadata.role to the app's default tier ('runner') and audits admin_role_revoked", async () => {
    supabaseAdmin.auth.admin.getUserById.mockResolvedValue({
      data: { user: authUser({ id: 'co-admin-1', app_metadata: { role: 'admin' } }) },
      error: null,
    })
    supabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
      data: { user: authUser({ id: 'co-admin-1', app_metadata: { role: 'runner' } }) },
      error: null,
    })
    const response = await usersDELETE(req('DELETE', { userId: 'co-admin-1' }))
    expect(response.status).toBe(200)
    const [userId, updates] = supabaseAdmin.auth.admin.updateUserById.mock.calls[0]
    expect(userId).toBe('co-admin-1')
    expect(updates).toEqual({ app_metadata: { role: 'runner' } })
    expect(auditInsert.insert).toHaveBeenCalledTimes(1)
    expect(auditInsert.insert.mock.calls[0][0].action).toBe('admin_role_revoked')
    expect(auditInsert.insert.mock.calls[0][0].target_id).toBe('co-admin-1')
  })
})
