type Role = 'admin' | 'organizer' | 'runner' | 'expired'

export function getUserRole(user: any): Role {
  return (
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    'runner'
  )
}

export function requireRole(
  user: any,
  allowedRoles: Role[]
): { ok: true } | { ok: false; status: number; message: string } {
  if (!user) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }

  const role = getUserRole(user)

  if (!allowedRoles.includes(role)) {
    return { ok: false, status: 403, message: 'Forbidden' }
  }

  return { ok: true }
}