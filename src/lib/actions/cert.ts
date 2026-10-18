'use server'

import { fetchDjangoApi } from '@/lib/django'
import { requireAuth } from '@/lib/auth/requireUser'

interface CertResult {
  cert_url: string
}

/**
 * On-demand e-certificate regeneration for a previously earned badge.
 * Django renders the PNG (deterministic storage key → overwrite) and
 * returns a fresh 24h signed URL. FR-63 / UC14 postcondition.
 */
export async function generateBadgeCertificate(input: {
  runnerId: string
  badgeKey: string
  eventId?: string | null
  badgeName: string
}) {
  const { supabase } = await requireAuth()

  let badgeQuery = supabase
    .from('runner_badges')
    .select('id, awarded_at')
    .eq('runner_id', input.runnerId)
    .eq('badge_key', input.badgeKey)

  // PostgREST null matching requires .is(); eq(null) silently matches nothing
  badgeQuery = input.eventId
    ? badgeQuery.eq('event_id', input.eventId)
    : badgeQuery.is('event_id', null)

  const { data: badge } = await badgeQuery.maybeSingle()

  if (!badge) {
    throw new Error("Badge not found — it hasn't been earned yet")
  }

  let eventName = input.badgeName
  let bibNumber = '—'

  if (input.eventId) {
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('id', input.eventId)
      .single()
    if (event?.name) eventName = event.name

    const { data: reg } = await supabase
      .from('registrations')
      .select('bib_number')
      .eq('runner_id', input.runnerId)
      .eq('event_id', input.eventId)
      .maybeSingle()
    if (reg?.bib_number) bibNumber = reg.bib_number
  }

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('full_name')
    .eq('id', input.runnerId)
    .single()

  const result: CertResult = await fetchDjangoApi('/ai/ecert/generate', {
    method: 'POST',
    body: JSON.stringify({
      runner_name: profile?.full_name || 'Pelikat Runner',
      event_name: eventName,
      bib_number: bibNumber,
      event_date: new Date(badge.awarded_at).toISOString().slice(0, 10),
      registration_id: `runner_${input.runnerId}_${input.badgeKey}${input.eventId ? `_${input.eventId.slice(0, 8)}` : ''}`,
    }),
  })

  if (!result.cert_url) throw new Error('Certificate generation failed')
  return result.cert_url
}
