import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, QrCode, Trophy, Award } from 'lucide-react'
import Link from 'next/link'

export default async function RunnerDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('*')
    .eq('user_id', user?.id)
    .single()

  const { data: registrations } = await supabase
    .from('registrations')
    .select('*, events(*), race_categories(*)')
    .eq('runner_id', profile?.id)
    .order('created_at', { ascending: false })

  const { data: badges } = await supabase
    .from('runner_badges')
    .select('*')
    .eq('runner_id', profile?.id)
    .order('awarded_at', { ascending: false })
    .limit(5)

  const upcomingEvents = registrations
    ?.filter(r => r.events?.status === 'published' && new Date(r.events.event_date) >= new Date())
    .slice(0, 3) || []

  const totalRunDistance = await supabase
    .from('run_logs')
    .select('distance_km')
    .eq('runner_id', profile?.id)
    .then(({ data }) => data?.reduce((acc, r) => acc + Number(r.distance_km || 0), 0) || 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Hello, {profile?.full_name || 'Runner'}!
        </h1>
        <p className="text-muted-foreground">Welcome to your runner dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingEvents.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Distance</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRunDistance.toFixed(1)} KM</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Badges Earned</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{badges?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events Completed</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {registrations?.filter(r => r.events?.status === 'closed').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
            <CardDescription>Your registered upcoming races</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length > 0 ? (
              <div className="space-y-4">
                {upcomingEvents.map((reg) => (
                  <div key={reg.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                    <div className="space-y-1">
                      <p className="font-medium">{reg.events?.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {new Date(reg.events?.event_date).toLocaleDateString()}
                        {reg.events?.location && (
                          <>
                            <MapPin className="h-3 w-3 ml-2" />
                            {reg.events?.location}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/runner/events/${reg.events?.id}/bib`}>
                        <Badge variant="outline">
                          <QrCode className="mr-1 h-3 w-3" />
                          BIB
                        </Badge>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No upcoming events</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Recent Badges</CardTitle>
            <CardDescription>Your recent achievements</CardDescription>
          </CardHeader>
          <CardContent>
            {badges && badges.length > 0 ? (
              <div className="space-y-4">
                {badges.map((badge) => (
                  <div key={badge.id} className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <Award className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{badge.badge_key.replace('_', ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(badge.awarded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No badges yet. Complete events to earn badges!</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}