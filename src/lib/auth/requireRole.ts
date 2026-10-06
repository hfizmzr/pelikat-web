type Role = 'admin' | 'organizer' | 'runner' | 'expired'

export function getUserRole(
  user: { app_metadata?: Record<string, unknown> | null } | null
): Role {
  // app_metadata is service-role-only. Never trust user_metadata for auth:
  // supabase.auth.updateUser() lets anyone set it. Anything unrecognized
  // (missing, legacy 'user', garbage) clamps to the lowest role.
  const role = user?.app_metadata?.role
  return role === 'admin' || role === 'organizer' || role === 'expired'
    ? role
    : 'runner'
}
