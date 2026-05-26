import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Crown } from 'lucide-react'

export default async function RunnerLeaderboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: leaderboard } = await supabase
    .from('leaderboard_virtual')
    .select('*')
    .order('rank', { ascending: true })
    .limit(50)

  const myRankIndex = leaderboard?.findIndex(l => l.runner_id === profile?.id) ?? -1
  const myStats = myRankIndex >= 0 ? leaderboard?.[myRankIndex] : null

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-6 w-6 text-yellow-500" />
      case 2:
        return <Medal className="h-6 w-6 text-gray-400" />
      case 3:
        return <Medal className="h-6 w-6 text-amber-700" />
      default:
        return <span className="text-muted-foreground font-bold text-lg">#{rank}</span>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-muted-foreground">Virtual run rankings across all events</p>
      </div>

      {myStats && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Your Ranking</CardTitle>
            <CardDescription>Your position in the global leaderboard</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                {getRankIcon(myStats.rank)}
              </div>
              <div>
                <p className="text-2xl font-bold">Rank #{myStats.rank}</p>
                <p className="text-muted-foreground">{myStats.total_km} KM total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Top Runners
          </CardTitle>
          <CardDescription>Global rankings by total distance</CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard && leaderboard.length > 0 ? (
            <div className="space-y-4">
              {leaderboard.map((entry) => (
                <div
                  key={entry.runner_id}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    entry.runner_id === profile?.id ? 'bg-primary/10 border border-primary' : 'bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 flex items-center justify-center">
                      {getRankIcon(entry.rank)}
                    </div>
                    <div>
                      <p className="font-medium">{entry.full_name}</p>
                      {entry.runner_id === profile?.id && (
                        <Badge variant="default" className="text-xs">You</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{entry.total_km} KM</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Trophy className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No leaderboard data yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}