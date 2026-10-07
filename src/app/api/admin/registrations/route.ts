import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getUserRole } from '@/lib/auth/requireRole'
import { logAudit } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role = getUserRole(authData.user)
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const eventId = searchParams.get('event_id') || ''
  const paymentStatus = searchParams.get('payment_status') || 'all'
  const checkInStatus = searchParams.get('checked_in') || 'all'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const offset = (page - 1) * limit

  // 1. Get summary metrics across all registrations
  const [
    { count: totalCount },
    { count: paidCount },
    { count: checkedInCount },
    { count: pendingCount },
    { data: eventsList },
  ] = await Promise.all([
    supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
    supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }).eq('checked_in', true),
    supabaseAdmin.from('registrations').select('id', { count: 'exact', head: true }).eq('payment_status', 'pending'),
    supabaseAdmin.from('events').select('id, name').order('name'),
  ])

  // 2. Build filtered data query
  let query = supabaseAdmin
    .from('registrations')
    .select(`
      id,
      bib_number,
      payment_status,
      checked_in,
      checked_in_at,
      created_at,
      events:event_id (id, name),
      race_categories:category_id (id, name, price),
      runner_profiles:runner_id (id, full_name, phone, gender, t_shirt_size),
      organizers:organizer_id (id, name, slug)
    `, { count: 'exact' })

  if (eventId && eventId !== 'all') {
    query = query.eq('event_id', eventId)
  }

  if (paymentStatus && paymentStatus !== 'all') {
    query = query.eq('payment_status', paymentStatus)
  }

  if (checkInStatus === 'true') {
    query = query.eq('checked_in', true)
  } else if (checkInStatus === 'false') {
    query = query.eq('checked_in', false)
  }

  if (search.trim()) {
    query = query.ilike('bib_number', `%${search.trim()}%`)
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data: registrations, count, error } = await query

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: registrations || [],
    pagination: {
      page,
      limit,
      totalCount: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
    metrics: {
      total: totalCount ?? 0,
      paid: paidCount ?? 0,
      checkedIn: checkedInCount ?? 0,
      pending: pendingCount ?? 0,
    },
    events: eventsList || [],
  })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role = getUserRole(authData.user)
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, bib_number, checked_in, payment_status } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing registration id' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (bib_number !== undefined) updates.bib_number = String(bib_number).trim()
    if (checked_in !== undefined) {
      updates.checked_in = Boolean(checked_in)
      updates.checked_in_at = checked_in ? new Date().toISOString() : null
    }
    if (payment_status !== undefined) {
      updates.payment_status = payment_status
    }

    // Get current record for audit diff
    const { data: currentRecord } = await supabaseAdmin
      .from('registrations')
      .select('*')
      .eq('id', id)
      .single()

    const { data, error } = await supabaseAdmin
      .from('registrations')
      .update(updates)
      .eq('id', id)
      .select(`
        id,
        bib_number,
        payment_status,
        checked_in,
        checked_in_at,
        created_at,
        events:event_id (id, name),
        race_categories:category_id (id, name, price),
        runner_profiles:runner_id (id, full_name, phone, gender, t_shirt_size),
        organizers:organizer_id (id, name, slug)
      `)
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Log administrative audit action
    await logAudit(
      supabaseAdmin,
      'admin_update_registration',
      id,
      {
        previous: currentRecord,
        updated: updates,
        updated_by: authData.user.email,
      }
    )

    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
