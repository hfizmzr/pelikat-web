import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: user } = await supabase.auth.getUser()
  if (!user.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role =
    user.user?.app_metadata?.role || user.user?.user_metadata?.role || 'runner'
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

  const role =
    user.user?.app_metadata?.role || user.user?.user_metadata?.role || 'runner'
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
    const { error } = await supabase
      .from('platform_settings')
      .upsert(
        {
          key,
          value,
          updated_by: user.user.id,
        },
        { onConflict: 'key' }
      )

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    updates.push(key)
  }

  return NextResponse.json({
    success: true,
    data: { updated: updates },
  })
}
