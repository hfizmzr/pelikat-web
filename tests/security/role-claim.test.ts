import { describe, expect, it } from 'vitest'
import { getUserRole } from '@/lib/auth/requireRole'

describe('getUserRole', () => {
  it('reads app_metadata (service-role-only)', () => {
    expect(getUserRole({ app_metadata: { role: 'admin' } })).toBe('admin')
  })

  it('ignores user-settable user_metadata role', () => {
    const user = { user_metadata: { role: 'admin' } }
    expect(getUserRole(user)).toBe('runner')
  })

  it('defaults to runner when no claim exists', () => {
    expect(getUserRole(null)).toBe('runner')
  })
})
