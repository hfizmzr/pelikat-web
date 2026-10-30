'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth/requireUser'

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * FR-32: organizer broadcast to every confirmed registrant of the event.
 * Ownership, length limits and the 1-per-minute guard are enforced by
 * send_event_broadcast (migration 084); delivery happens asynchronously in
 * the dispatch-notifications edge function.
 */
export async function sendEventBroadcast(input: {
  eventId: string
  subject: string
  body: string
  sendEmail: boolean
  sendPush: boolean
}): Promise<ActionResult<{ recipients: number }>> {
  if (!UUID.test(input.eventId)) return { ok: false, error: 'Invalid event' }
  const { supabase } = await requireAuth()

  const { data, error } = await supabase.rpc('send_event_broadcast', {
    p_event_id: input.eventId,
    p_subject: input.subject,
    p_body: input.body,
    p_send_email: input.sendEmail,
    p_send_push: input.sendPush,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/organizer/events/${input.eventId}/messages`)
  const row = Array.isArray(data) ? data[0] : data
  return { ok: true, recipients: Number(row?.recipient_count ?? 0) }
}
