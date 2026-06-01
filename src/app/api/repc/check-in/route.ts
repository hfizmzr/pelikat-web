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

function toApiResponse(result: RepcCheckInResult) {
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
  const qrPayload = typeof body.qr_payload === 'string' ? body.qr_payload : ''
  const eventId = typeof body.event_id === 'string' ? body.event_id : ''

  if (!qrPayload || !eventId) {
    return NextResponse.json(
      { success: false, valid: false, message: 'Missing QR payload or event ID' },
      { status: 400 }
    )
  }

  let verified: VerifyQrResponse

  try {
    verified = await fetchDjangoApi('/ai/qr/verify', {
      method: 'POST',
      body: JSON.stringify({ qr_payload: qrPayload }),
    })
  } catch {
    return NextResponse.json(
      { success: false, valid: false, message: 'Could not verify QR code' },
      { status: 502 }
    )
  }

  if (!verified.valid) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: verified.error || 'Invalid QR code',
    })
  }

  if (verified.event_id !== eventId) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: 'QR code belongs to a different event',
    })
  }

  if (!verified.runner_id || !verified.bib_number) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: 'QR code is missing runner details',
    })
  }

  const { data, error } = await supabase.rpc('repc_check_in_registration', {
    p_event_id: eventId,
    p_runner_id: verified.runner_id,
    p_bib_number: verified.bib_number,
    p_is_proxy: false,
    p_consent_code: null,
    p_collected_by: user.email ?? user.id,
  })

  if (error) {
    return NextResponse.json({
      success: false,
      valid: false,
      message: error.message,
    })
  }

  const result = normalizeRepcCheckInResult((data?.[0] ?? null) as RepcCheckInRpcRow | null)

  // Log successful check-in
  if (result.success) {
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      actor_email: user.email,
      action: 'runner_check_in',
      target_id: verified.runner_id,
      metadata: {
        event_id: eventId,
        bib_number: verified.bib_number,
        registration_id: result.registrationId,
      },
    })
  }

  return NextResponse.json(toApiResponse(result))
}
