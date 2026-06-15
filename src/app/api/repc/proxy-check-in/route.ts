import { NextResponse } from 'next/server'
import { fetchDjangoApi } from '@/lib/django'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeRepcCheckInResult,
  type RepcCheckInResult,
  type RepcCheckInRpcRow,
} from '@/lib/repc'

type VerifyQrResponse = {
  valid?: boolean
  error?: string
  runner_id?: string
  event_id?: string
  bib_number?: string
}

type RunnerProfile = {
  full_name: string | null
}

type RegistrationWithProfile = {
  id: string
  runner_id: string
  bib_number: string
  runner_profiles: RunnerProfile | RunnerProfile[] | null
}

type ConsentCodeRecord = {
  id: string
}

function getProfile(registration: RegistrationWithProfile) {
  const profile = registration.runner_profiles
  return Array.isArray(profile) ? profile[0] : profile
}

function toApiResponse(
  result: RepcCheckInResult,
  collector: RegistrationWithProfile
) {
  const collectorProfile = getProfile(collector)

  return {
    success: result.success,
    valid: result.success,
    message: result.message,
    registration_id: result.registrationId,
    already_checked_in: result.alreadyCheckedIn,
    runner: {
      name: result.runnerName ?? 'Unknown',
      bib: result.bibNumber ?? '',
      shirt_size: result.shirtSize,
      remaining_qty: result.remainingQty,
    },
    collector: {
      runner_id: collector.runner_id,
      bib: collector.bib_number,
      name: collectorProfile?.full_name ?? 'Unknown collector',
    },
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, valid: false, message: 'Unauthorized' }, { status: 401 })
  }

  const role = user.app_metadata?.role || user.user_metadata?.role || 'runner'
  if (role !== 'organizer' && role !== 'admin') {
    return NextResponse.json({ success: false, valid: false, message: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const eventId = typeof body.event_id === 'string' ? body.event_id : ''
  const absentBibNumber = typeof body.absent_bib_number === 'string' ? body.absent_bib_number.trim() : ''
  const consentCode = typeof body.consent_code === 'string' ? body.consent_code.trim().toUpperCase() : ''
  const collectorQrPayload = typeof body.collector_qr_payload === 'string' ? body.collector_qr_payload : ''

  if (!eventId || !absentBibNumber || !consentCode || !collectorQrPayload) {
    return NextResponse.json(
      { success: false, valid: false, message: 'Missing event, BIB, consent code, or collector QR' },
      { status: 400 }
    )
  }

  let verifiedCollector: VerifyQrResponse

  try {
    verifiedCollector = await fetchDjangoApi('/ai/qr/verify', {
      method: 'POST',
      body: JSON.stringify({ qr_payload: collectorQrPayload }),
    })
  } catch {
    return NextResponse.json(
      { success: false, valid: false, message: 'Could not verify collector QR code' },
      { status: 502 }
    )
  }

  if (!verifiedCollector.valid) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: verifiedCollector.error || 'Invalid collector QR code',
    })
  }

  if (verifiedCollector.event_id !== eventId) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: 'Collector must be registered in the same event',
    })
  }

  if (!verifiedCollector.runner_id || !verifiedCollector.bib_number) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: 'Collector QR is missing runner details',
    })
  }

  const { data: collectorRegistration, error: collectorError } = await supabase
    .from('registrations')
    .select('id, runner_id, bib_number, runner_profiles(full_name)')
    .eq('event_id', eventId)
    .eq('runner_id', verifiedCollector.runner_id)
    .eq('bib_number', verifiedCollector.bib_number)
    .maybeSingle()

  if (collectorError) {
    return NextResponse.json({ success: false, valid: false, message: collectorError.message })
  }

  if (!collectorRegistration) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: 'Collector must be a registered participant in the same event',
    })
  }

  let { data: absentRegistration, error: absentError } = await supabase
    .from('registrations')
    .select('runner_id, bib_number')
    .eq('event_id', eventId)
    .eq('bib_number', absentBibNumber)
    .maybeSingle()

  if (!absentRegistration && !absentError) {
    const fallback = await supabase
      .from('registrations')
      .select('runner_id, bib_number')
      .eq('event_id', eventId)
      .ilike('bib_number', absentBibNumber)
      .maybeSingle()

    absentRegistration = fallback.data
    absentError = fallback.error
  }

  if (absentError) {
    return NextResponse.json({ success: false, valid: false, message: absentError.message })
  }

  if (!absentRegistration?.runner_id || !absentRegistration.bib_number) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: 'Absent runner registration not found',
    })
  }

  if (absentRegistration.runner_id === collectorRegistration.runner_id) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: 'Use normal QR check-in when the runner is collecting their own race pack',
    })
  }

  const collectorProfile = getProfile(collectorRegistration as RegistrationWithProfile)
  const collectorLabel = `${collectorProfile?.full_name ?? 'Unknown collector'} (BIB ${collectorRegistration.bib_number})`

  const { data, error } = await supabase.rpc('repc_check_in_registration', {
    p_event_id: eventId,
    p_runner_id: absentRegistration.runner_id,
    p_bib_number: absentRegistration.bib_number,
    p_is_proxy: true,
    p_consent_code: consentCode,
    p_collected_by: collectorLabel,
  })

  if (error) {
    console.error('repc proxy check-in RPC error:', {
      message: error.message,
      eventId,
      absentBibNumber: absentRegistration.bib_number,
      collectorBibNumber: collectorRegistration.bib_number,
    })
    return NextResponse.json({
      success: false,
      valid: false,
      message: error.message,
    })
  }

  const result = normalizeRepcCheckInResult((data?.[0] ?? null) as RepcCheckInRpcRow | null)

  if (result.success && !result.alreadyCheckedIn) {
    let consentCodeId: string | null = null

    const { data: consentRecord } = await supabase
      .from('repc_consent_codes')
      .select('id')
      .eq('registration_id', result.registrationId)
      .eq('code', consentCode)
      .maybeSingle<ConsentCodeRecord>()

    consentCodeId = consentRecord?.id ?? null

    const now = new Date().toISOString()

    if (result.registrationId) {
      await supabase
        .from('repc_collections')
        .update({
          collector_registration_id: collectorRegistration.id,
          collector_runner_id: collectorRegistration.runner_id,
          collector_bib_number: collectorRegistration.bib_number,
          collector_name: collectorProfile?.full_name ?? null,
          collection_method: 'proxy',
          qr_verified_at: now,
          staff_email: user.email ?? null,
          notes: `Proxy collection by ${collectorLabel}`,
        })
        .eq('registration_id', result.registrationId)
    }

    if (consentCodeId) {
      await supabase
        .from('repc_consent_codes')
        .update({
          used_by_runner_id: collectorRegistration.runner_id,
          used_by_registration_id: collectorRegistration.id,
          used_at: now,
        })
        .eq('id', consentCodeId)
    }

    await supabase.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action: 'runner_proxy_check_in',
      target_id: absentRegistration.runner_id,
      metadata: {
        event_id: eventId,
        bib_number: absentRegistration.bib_number,
        registration_id: result.registrationId,
        collector_runner_id: collectorRegistration.runner_id,
        collector_bib_number: collectorRegistration.bib_number,
        collector_name: collectorProfile?.full_name ?? null,
      },
    })
  }

  return NextResponse.json(toApiResponse(result, collectorRegistration as RegistrationWithProfile))
}
