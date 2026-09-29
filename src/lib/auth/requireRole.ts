type Role = 'admin' | 'organizer' | 'runner' | 'expired'

export function getUserRole(user: any): Role {
  return (
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    'runner'
  )
}