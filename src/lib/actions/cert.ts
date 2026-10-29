'use server'

import { fetchDjangoApi } from '@/lib/django'
import { requireAuth } from '@/lib/auth/requireUser'
import { isConfirmedStatus } from '@/lib/registration-status'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSurfaceTheme, type SurfaceEventInput, type SurfaceTheme } from '@/lib/theme/surface'
import { isPlainObject } from '@/lib/theme/utils'
import { storageAssetUrl } from '@/lib/theme/assets'

interface CertResult {
  cert_url: string
}

/**
 * The ADDITIVE theme block of the /ai/ecert/generate payload (P4 Task 4,
 * spec §7), built ONLY from a resolvable theme (getSurfaceTheme fast path →
 * null → the legacy 5-key payload is sent byte-equal to today).
 *
 * Shape follows the backend normalizer exactly:
 * - colors = the HEX carried by the resolved brand slots (present only when
 *   the themed value took effect; contrast-degraded → platform → omitted so
 *   the cert fallback matches the UI — ResolvedTheme's oklch slots cannot go
 *   over the wire, Django's normalizer accepts ^#hex$ only);
 * - certificate_background_url = EXPANDED https storage URL (Django's SSRF
 *   allowlist requires the exact SUPABASE_URL storage prefix) — an asset that
 *   fails expansion (junk/hostile) is OMITTED, never null/empty;
 * - labels = the always-resolved vocabulary under the normalizer's SHORT keys;
 * - font_url is never sent (unknown keys are dropped server-side);
 * absent values are omitted keys, never empty strings or nulls.
 */
function certThemeOf(surface: SurfaceTheme) {
  const resolved = surface.resolved
  if (!resolved) return null
  const colors: Record<string, string> = {}
  for (const role of ['primary', 'secondary', 'accent'] as const) {
    const hex = resolved[role].hex
    if (typeof hex === 'string') colors[role] = hex
  }
  // Validated slot (PR34 review): resolve()'s asset gate already host-pins
  // https values to the platform storage origin (P3 Task 7), so a hostile
  // hand-crafted https row drops HERE — a raw surface.tokens read would
  // ship it past validation instead.
  const background = resolved.assets.certificate_background
  const certificateBackgroundUrl =
    typeof background === 'string' ? storageAssetUrl(background) : null
  return {
    ...(Object.keys(colors).length > 0 ? { colors } : {}),
    ...(certificateBackgroundUrl !== null ? { certificate_background_url: certificateBackgroundUrl } : {}),
    labels: Object.fromEntries(
      Object.entries(resolved.labels).map(([key, value]) => [key.replace(/_label$/, ''), value]),
    ),
    layout: { name_plate: 'auto' },
  }
}

/** Event-scoped theme resolution — no event row (badge path without an
 * event) → null → legacy payload.
 *
 * Emission gate beyond the platform resolution (PR34 review r4411927725):
 * getSurfaceTheme counts even the EMPTY `{}` theme_config as "config"
 * (plain-object rule, P3 Task 3) and still resolves the platform theme for
 * it, but a zero-content config carries no presentation value — emitting
 * its fallback labels against nothing would break the legacy request
 * body. So the theme block ships only when an effective theme input
 * exists: a preset id is set, OR theme_config is a plain object holding
 * at least one key. */
async function eventCertTheme(supabase: SupabaseClient, event: SurfaceEventInput | null) {
  if (!event) return null
  // Same normalization getSurfaceTheme applies (''/non-string → no preset).
  const presetId =
    typeof event.theme_preset_id === 'string' && event.theme_preset_id.length > 0
      ? event.theme_preset_id
      : null
  const configHasKeys =
    isPlainObject(event.theme_config) && Object.keys(event.theme_config).length > 0
  if (presetId === null && !configHasKeys) return null
  return certThemeOf(await getSurfaceTheme(event, supabase))
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
  let eventRow: { theme_preset_id?: string | null; theme_config?: unknown } | null = null

  if (input.eventId) {
    const { data: event } = await supabase
      .from('events')
      .select('name, theme_preset_id, theme_config')
      .eq('id', input.eventId)
      .single()
    if (event?.name) eventName = event.name
    eventRow = event
    const { data: reg } = await supabase
      .from('registrations')
      .select('bib_number')
      .eq('runner_id', input.runnerId)
      .eq('event_id', input.eventId)
      .maybeSingle()
    if (reg?.bib_number) bibNumber = reg.bib_number
  }

  const { data: profile } = await supabase
    .from('runner_profiles_safe') // organizer-safe view: no IC/document/phone/dob columns
    .select('full_name')
    .eq('id', input.runnerId)
    .single()

  const certTheme = await eventCertTheme(
    supabase,
    eventRow && input.eventId
      ? {
          id: input.eventId,
          theme_preset_id: eventRow.theme_preset_id ?? null,
          theme_config: eventRow.theme_config,
        }
      : null,
  )

  const result: CertResult = await fetchDjangoApi('/ai/ecert/generate', {
    method: 'POST',
    body: JSON.stringify({
      runner_name: profile?.full_name || 'Pelikat Runner',
      event_name: eventName,
      bib_number: bibNumber,
      event_date: new Date(badge.awarded_at).toISOString().slice(0, 10),
      registration_id: `runner_${input.runnerId}_${input.badgeKey}${input.eventId ? `_${input.eventId.slice(0, 8)}` : ''}`,
      ...(certTheme ? { theme: certTheme } : {}),
    }),
  })

  if (!result.cert_url) throw new Error('Certificate generation failed')
  return result.cert_url
}

/**
 * E-certificate for a completed virtual run: the runner's logged distance
 * for the event must reach the event's target_distance_km. No badge row is
 * required — completion is computed from run_logs directly.
 */
export async function generateVirtualEventCertificate(input: { eventId: string }) {
  const { supabase, user } = await requireAuth()

  const { data: event } = await supabase
    .from('events')
    .select('name, event_type, target_distance_km, theme_preset_id, theme_config')
    .eq('id', input.eventId)
    .single()

  if (!event || event.event_type !== 'virtual' || !event.target_distance_km) {
    throw new Error('This event has no virtual run certificate')
  }

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id, full_name')
    .eq('user_id', user.id)
    .single()

  if (!profile) throw new Error('Runner profile not found')

  // Authorization (CWE-862): completion is computed from run_logs, so an
  // explicit ownership + confirmed-registration gate is required here —
  // a pending-payment runner must not be able to mint an e-cert.
  const { data: reg } = await supabase
    .from('registrations')
    .select('payment_status')
    .eq('event_id', input.eventId)
    .eq('runner_id', profile.id)
    .maybeSingle()

  if (!reg || !isConfirmedStatus(reg.payment_status)) {
    throw new Error('You need a confirmed registration for this event')
  }

  const { data: logs } = await supabase
    .from('run_logs')
    .select('distance_km')
    .eq('event_id', input.eventId)
    .eq('runner_id', profile.id)

  const totalKm = (logs ?? []).reduce((acc, l) => acc + Number(l.distance_km || 0), 0)
  if (totalKm < Number(event.target_distance_km)) {
    throw new Error(`Target not reached yet — ${totalKm.toFixed(1)} / ${event.target_distance_km} km`)
  }

  // Theme resolution after the authorization/completion gates — a runner who
  // cannot mint a cert never triggers theme queries.
  const certTheme = await eventCertTheme(supabase, {
    id: input.eventId,
    theme_preset_id: event.theme_preset_id ?? null,
    theme_config: event.theme_config,
  })

  const result: CertResult = await fetchDjangoApi('/ai/ecert/generate', {
    method: 'POST',
    body: JSON.stringify({
      runner_name: profile.full_name || 'Pelikat Runner',
      event_name: event.name,
      bib_number: '—',
      event_date: new Date().toISOString().slice(0, 10),
      registration_id: `virtual_${input.eventId.slice(0, 8)}_${profile.id.slice(0, 8)}`,
      ...(certTheme ? { theme: certTheme } : {}),
    }),
  })

  if (!result.cert_url) throw new Error('Certificate generation failed')
  return result.cert_url
}
