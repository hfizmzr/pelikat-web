import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchDjangoApi } from '@/lib/django'

// Registration payments: the browser never talks to HitPay or Django
// directly. This BFF verifies the session, reads the authoritative
// registration server-side (RLS-scoped), and forwards a trusted payload.
// Payment truth is confirmed exclusively by the signed webhook — a
// redirect back from HitPay never marks anything paid.

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const input = await request.json().catch(() => null)
  if (!input?.registrationId || !input?.email || !input?.name) {
    return NextResponse.json(
      { error: 'registrationId, email and name are required' },
      { status: 400 }
    )
  }

  const { data: registration } = await supabase
    .from('registrations')
    .select('id, event_id, runner_id, race_categories(price)')
    .eq('id', input.registrationId)
    .single()

  if (!registration) {
    return NextResponse.json(
      { error: 'Registration not found' },
      { status: 404 }
    )
  }

  const appUrl =
    process.env.NEXT_PUBLIC_TUNNEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  const category = Array.isArray(registration.race_categories)
    ? registration.race_categories[0]
    : registration.race_categories

  try {
    const data = await fetchDjangoApi('/payments/create', {
      method: 'POST',
      body: JSON.stringify({
        order_type: 'registration',
        registration_id: registration.id,
        reference_number: registration.id,
        runner_id: registration.runner_id,
        amount: Number(category?.price ?? 0),
        email: input.email,
        name: input.name,
        purpose: 'Event registration',
        redirect_url: `${appUrl}/runner/events/${registration.event_id}/payment`,
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
