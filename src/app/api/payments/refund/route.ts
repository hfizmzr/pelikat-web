import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchDjangoApi } from '@/lib/django'

// Organizer-initiated refunds. Ownership is enforced by RLS: selecting
// the payments row with the organizer's session returns it only when
// organizer_id matches get_my_organizer_id().

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const input = await request.json().catch(() => null)
  if (!input?.provider_request_id) {
    return NextResponse.json(
      { error: 'provider_request_id is required' },
      { status: 400 }
    )
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('id')
    .eq('provider_request_id', input.provider_request_id)
    .single()

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
        amount: input.amount,
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
