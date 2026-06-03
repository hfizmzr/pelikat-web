import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { event_id, gender } = body

  let query = supabase.from('leaderboard_virtual').select('*').limit(500)
  if (event_id && event_id !== 'all') {
    query = query.eq('event_id', event_id)
  }
  if (gender && gender !== 'all') {
    query = query.eq('gender', gender)
  }

  const { data } = await query.order('rank', { ascending: true })

  const header = 'Rank,Name,Total KM,Gender\n'
  const rows = (data || [])
    .map(
      (row: Record<string, unknown>) =>
        `${row.rank},"${row.full_name}",${row.total_km},"${row.gender || ''}"`
    )
    .join('\n')

  return new NextResponse(header + rows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="leaderboard-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
