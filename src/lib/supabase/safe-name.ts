/**
 * Organizer display-name resolution for public/runner server pages
 * (P3 Task 4). organizers RLS has no public SELECT (019), so a runner's
 * `events(organizers(name))` join resolves to NULL — this helper recovers the
 * name through the service-role client, bypassing RLS.
 *
 * POST-VISIBILITY ONLY: callers MUST load the event row through their normal
 * (anon/RLS) client and pass its visibility gate first — a draft/unfound event
 * must notFound() BEFORE any call here, so a service-role read never leaks
 * details for a hidden event (plan review focus #4, §12.3).
 *
 * Never throws: any error/empty result → null, the caller renders its own
 * fallback copy.
 */
import { supabaseAdmin } from './service-role'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function safeOrganizerName(
  client: SupabaseClient,
  organizerId: string | null | undefined,
): Promise<string | null> {
  if (typeof organizerId !== 'string' || organizerId.length === 0) return null
  try {
    const { data } = await client
      .from('organizers')
      .select('name')
      .eq('id', organizerId)
      .maybeSingle()
    const name = typeof (data as { name?: string } | null)?.name === 'string'
      ? (data as { name: string }).name
      : null
    return name !== null && name.trim().length > 0 ? name : null
  } catch {
    return null
  }
}

/** Server-component convenience: binds the service-role client. */
export async function fetchOrganizerName(
  organizerId: string | null | undefined,
): Promise<string | null> {
  return safeOrganizerName(supabaseAdmin, organizerId)
}
