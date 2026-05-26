import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Users, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default async function RunnerEventsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: myRegistrations } = await supabase
    .from('registrations')
    .select('event_id')
    .eq('runner_id', profile?.id)

  const registeredEventIds = myRegistrations?.map(r => r.event_id) || []

  const { data: events } = await supabase
    .from('events')
    .select('*, organizers(name), race_categories(count)')
    .eq('status', 'published')
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
        <p className="text-muted-foreground">Discover and register for upcoming running events</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events?.map((event) => {
          const isRegistered = registeredEventIds.includes(event.id)

          return (
            <Card key={event.id} className="border-border overflow-hidden">
              <div className="h-2 bg-primary" />
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{event.name}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(event.event_date).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {event.location && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
                    <MapPin className="h-3 w-3" />
                    {event.location}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {event.description || 'No description available'}
                </p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    <Users className="mr-1 h-3 w-3" />
                    {event.race_categories?.[0]?.count || 0} categories
                  </Badge>
                  {isRegistered ? (
                    <Link href={`/runner/events/${event.id}`}>
                      <Button size="sm">
                        View Details
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/runner/events/${event.id}`}>
                      <Button size="sm" variant="outline">
                        Register
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {(!events || events.length === 0) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No upcoming events available</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}