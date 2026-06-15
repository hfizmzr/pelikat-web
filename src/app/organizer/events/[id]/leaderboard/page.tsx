import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trophy, Medal, Crown } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Event Leaderboard - Pelikat',
  description: 'Virtual run leaderboard for this event',
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="h-5 w-5 text-yellow-500" />
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />
    case 3:
      return <Medal className="h-5 w-5 text-amber-700" />
    default:
      return <span className="text-muted-foreground font-medium">#{rank}</span>
  }
}

export default async function OrganizerEventLeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const [{ data: leaderboard }, { data: runLogs }] = await Promise.all([
    supabase
      .from('leaderboard_virtual')
      .select('*')
      .eq('event_id', id)
      .order('rank', { ascending: true })
      .limit(20),
    supabase
      .from('run_logs')
      .select('*, runner_profiles(full_name)')
      .eq('event_id', id)
      .order('logged_at', { ascending: false })
      .limit(10),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-muted-foreground">Virtual run leaderboard for {event.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Runners</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leaderboard?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Distance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {leaderboard?.reduce((acc, l) => acc + Number(l.total_km || 0), 0).toFixed(1) || 0} KM
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Distance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {leaderboard?.[0]?.total_km ? `${leaderboard[0].total_km} KM` : '0 KM'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Top Runners
          </CardTitle>
          <CardDescription>Ranked by total distance</CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard && leaderboard.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Runner</TableHead>
                  <TableHead>Total Distance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry) => (
                  <TableRow key={entry.runner_id}>
                    <TableCell className="font-medium">
                      {getRankIcon(entry.rank)}
                    </TableCell>
                    <TableCell className="font-medium">{entry.full_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.total_km} KM</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">View Profile</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Trophy className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No leaderboard data yet</p>
              <p className="text-sm text-muted-foreground">Runners will appear here after logging their runs</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Recent Run Logs</CardTitle>
          <CardDescription>Latest activity</CardDescription>
        </CardHeader>
        <CardContent>
          {runLogs && runLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Runner</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Logged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.runner_profiles?.full_name || 'Unknown'}
                    </TableCell>
                    <TableCell>{log.distance_km} KM</TableCell>
                    <TableCell>{Math.floor(log.duration_sec / 60)}m {log.duration_sec % 60}s</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(log.logged_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">No run logs yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}