/**
 * Platform-wide counts for the admin overview (server components only).
 *
 * registrations has no admin RLS read policy by design: every admin read of
 * it goes through the service role after a server-side role check (see
 * /api/admin/registrations). The page's session client therefore counts 0
 * rows. This helper does the same role check itself, then a head-only count,
 * so no registration rows (or runner PII) ever leave the database.
 *
 * Never throws: a non-admin caller or any error → null, the page renders 0.
 */
import { supabaseAdmin } from './service-role'
import { getUserRole } from '@/lib/auth/requireRole'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function countAllRegistrationsForAdmin(
  session: SupabaseClient,
): Promise<number | null> {
  try {
    const { data: { user } } = await session.auth.getUser()
    if (getUserRole(user) !== 'admin') return null
    const { count, error } = await supabaseAdmin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
    return error ? null : count
  } catch {
    return null
  }
}
