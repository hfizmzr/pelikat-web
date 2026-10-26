import { createClient } from '@/lib/supabase/server'
import { getUserRole } from '@/lib/auth/requireRole'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: user } = await supabase.auth.getUser()
  if (!user.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role = getUserRole(user.user)
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .order('key')

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  const settings: Record<string, unknown> = {}
  for (const row of data || []) {
    settings[row.key] = row.value
  }

  return NextResponse.json({ success: true, data: settings })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: user } = await supabase.auth.getUser()
  if (!user.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role = getUserRole(user.user)
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { settings } = body

  if (!settings || typeof settings !== 'object') {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const updates = []
  for (const [key, value] of Object.entries(settings)) {
    // The organizer subscription price is admin-configurable MYR money;
    // validate its shape before persisting (amount ≥ RM 1.00 stored as a
    // 2dp decimal — never integer sen). Other keys are written verbatim.
    if (key === 'organizer_subscription_price') {
      if (!value || typeof value !== 'object') {
        return NextResponse.json(
          { success: false, error: 'Subscription pricing must be an object' },
          { status: 400 }
        )
      }
      const submitted = value as Record<string, unknown>
      const amount = Number(submitted.amount)
      const durationDays = Number(submitted.duration_days)
      if (!Number.isFinite(amount) || amount < 1) {
        return NextResponse.json(
          { success: false, error: 'Subscription amount must be a MYR decimal of at least 1.00' },
          { status: 400 }
        )
      }
      if (!Number.isInteger(durationDays) || durationDays < 1) {
        return NextResponse.json(
          { success: false, error: 'Subscription duration must be a whole number of days (at least 1)' },
          { status: 400 }
        )
      }

      const { error, count } = await supabase
        .from('platform_settings')
        .update(
          {
            value: {
              amount: Number(amount.toFixed(2)),
              currency: 'MYR',
              period:
                typeof submitted.period === 'string' && submitted.period
                  ? submitted.period
                  : 'year',
              duration_days: durationDays,
            },
            updated_by: user.user.id,
          },
          { count: 'exact' }
        )
        .eq('key', key)

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      if (!count) {
        // All platform_settings rows are seeded by migrations; 0 rows
        // updated means an unknown key (upsert is not an option: RLS
        // grants only SELECT + UPDATE — migration 073 — so an INSERT
        // would always be denied).
        return NextResponse.json(
          { success: false, error: `Unknown setting key: ${key}` },
          { status: 404 }
        )
      }
    } else {
      const { error, count } = await supabase
        .from('platform_settings')
        .update(
          {
            value,
            updated_by: user.user.id,
          },
          { count: 'exact' }
        )
        .eq('key', key)

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        )
      }

      if (!count) {
        return NextResponse.json(
          { success: false, error: `Unknown setting key: ${key}` },
          { status: 404 }
        )
      }
    }

    updates.push(key)
  }

  return NextResponse.json({
    success: true,
    data: { updated: updates },
  })
}
