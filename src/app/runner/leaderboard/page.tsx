import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy } from 'lucide-react'
import { LiveLeaderboard } from '@/components/gamification/live-leaderboard'
import { LeaderboardFilters } from './filters'
import { ExportCSV } from './export-csv'

interface SearchParams {
  event_id?: string
  gender?: string
}

export default async function RunnerLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const { event_id, gender } = await searchParams

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  let query = supabase.from('leaderboard_virtual').select('*').limit(50)

  if (event_id && event_id !== 'all') {
    query = query.eq('event_id', event_id)
  }
  if (gender && gender !== 'all') {
    query = query.eq('gender', gender)
  }

  const { data: leaderboard } = await query.order('rank', { ascending: true })

  const { data: events } = await supabase
    .from('events')
    .select('id, name')
    .order('event_date', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-muted-foreground">Virtual run rankings across all events</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <LeaderboardFilters events={events || []} />
        <ExportCSV
          eventId={event_id}
          gender={gender}
        />
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Top Runners
          </CardTitle>
          <CardDescription>Global rankings by total distance</CardDescription>
        </CardHeader>
        <CardContent>
          <LiveLeaderboard
            initialData={leaderboard || []}
            currentRunnerId={profile?.id}
          />
        </CardContent>
      </Card>
    </div>
  )
}
