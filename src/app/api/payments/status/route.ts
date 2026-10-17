import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchDjangoApi } from '@/lib/django'

// Payment status polling. Only Django's answer is reported — query
// params on THIS request are never interpreted as payment state.

export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const registrationId = requestUrl.searchParams.get('registrationId')
  if (!registrationId) {
    return NextResponse.json(
      { error: 'registrationId is required' },
      { status: 400 }
    )
  }

  const { data: registration } = await supabase
    .from('registrations')
    .select('id')
    .eq('id', registrationId)
    .single()

  if (!registration) {
    return NextResponse.json(
      { error: 'Registration not found' },
      { status: 404 }
    )
  }

  try {
    const data = await fetchDjangoApi(
      `/payments/status?reference_number=${encodeURIComponent(registrationId)}`
    )
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Payment service unavailable' },
      { status: 502 }
    )
  }
}
