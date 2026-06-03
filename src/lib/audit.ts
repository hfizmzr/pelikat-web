import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Log an audit event with full actor denormalization.
 * Call this from app-level code for business events that triggers can't capture
 * (approvals, logins, complex multi-step actions).
 *
 * The helper automatically pulls the current user's email/name from auth
 * and denormalizes it into the audit_log row for immutable history.
 */
export async function logAudit(
  supabase: SupabaseClient,
  action: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) {
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from('audit_log').insert({
    actor_id: user?.id || null,
    actor_email: user?.email || null,
    actor_name: (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || null,
    action,
    target_id: targetId || null,
    metadata: metadata || null,
  })
}
