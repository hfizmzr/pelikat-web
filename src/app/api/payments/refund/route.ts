import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireUser'
import { fetchDjangoApi } from '@/lib/django'

// Organizer-initiated refunds (CWE-285 hardening). Authentication is via
// requireAuth(); authorization is app-enforced with an explicit
// `.eq('organizer_id', caller)` filter — Django is trust-of-internal and
// carries no caller identity, so RLS-scope alone cannot distinguish a
// paying runner from the owning organizer. Runner calls with a
// provider_request_id resolve to 403 before anything reaches Django.

export async function POST(request: Request) {
  const { supabase, user } = await requireAuth()

  const organizerId = user?.app_metadata?.organizer_id
  if (!organizerId) {
    return NextResponse.json(
      { error: 'Only organizers can request refunds' },
      { status: 403 }
    )
  }

  const input = await request.json().catch(() => null)
  if (!input?.provider_request_id) {
    return NextResponse.json(
      { error: 'provider_request_id is required' },
      { status: 400 }
    )
  }

  // Schema-validate the client amount before forwarding (Django remains the
  // authority on the remaining-balance logic; this only gates garbage).
  const amount = input.amount
  if (
    amount !== undefined &&
    (!Number.isFinite(Number(amount)) || Number(amount) <= 0)
  ) {
    return NextResponse.json(
      { error: 'Refund amount must be a positive number' },
      { status: 400 }
    )
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('id, organizer_id')
    .eq('provider_request_id', input.provider_request_id)
    .eq('organizer_id', organizerId)
    .maybeSingle()

  if (!payment) {
    return NextResponse.json(
      { error: 'Payment not found for this organizer' },
      { status: 403 }
    )
  }

  try {
    const data = await fetchDjangoApi('/payments/refund', {
      method: 'POST',
      body: JSON.stringify({
        provider_request_id: input.provider_request_id,
        amount,
      }),
    })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Payment service unavailable' },
      { status: 502 }
    )
  }
}
