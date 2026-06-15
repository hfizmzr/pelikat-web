import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import RegisteredEventsSection from '@/components/events/registered-events-section'
import { Calendar, MapPin, Users, Search, X } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Events - Pelikat',
  description: 'Discover and register for upcoming running events',
}

export default async function RunnerEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; search?: string }>
}) {
  const { period = 'upcoming', search = '' } = await searchParams
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: myRegistrations } = await supabase
    .from('registrations')
    .select('*, events(name, event_date, location, status), race_categories(name)')
    .eq('runner_id', profile?.id)
    .order('created_at', { ascending: false })

  const registeredEventIds = myRegistrations?.map(r => r.event_id) || []

  let eventsQuery = supabase
    .from('events')
    .select('*, organizers(name), race_categories(count)')
    .eq('status', 'published')
    .order('event_date', { ascending: true })

  if (period === 'upcoming') {
    eventsQuery = eventsQuery.gte('event_date', now)
  } else if (period === 'past') {
    eventsQuery = eventsQuery.lt('event_date', now)
  }

  if (search) {
    eventsQuery = eventsQuery.or(
      `name.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`
    )
  }

  const { data: events } = await eventsQuery

  const tabs = [
    { label: 'Upcoming', value: 'upcoming' },
    { label: 'Past', value: 'past' },
    { label: 'All Events', value: 'all' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
        <p className="text-muted-foreground">Discover and register for running events</p>
      </div>

      <form action="/runner/events" method="GET">
        <input type="hidden" name="period" value={period} />
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search by event name, location, or description..."
            className="h-12 pl-12 pr-12 text-base"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
              asChild
            >
              <Link href={`/runner/events?period=${period}`}>
                <X className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </form>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Browse
        </span>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {tabs.map(tab => (
            <Link
              key={tab.value}
              href={`/runner/events?period=${tab.value}${search ? `&search=${search}` : ''}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {myRegistrations && myRegistrations.length > 0 && (
        <>
          <RegisteredEventsSection registrations={myRegistrations} />
          <div className="border-t" />
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events
          ?.filter(e => !registeredEventIds.includes(e.id))
          ?.map((event) => (
            <Card key={event.id} className="border-border overflow-hidden hover:shadow-md transition-shadow">
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
                  <Link href={`/runner/events/${event.id}`}>
                    <Button size="sm" variant="outline">
                      Register
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        }
      </div>

      {(!events || events.length === 0) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search
                ? `No events found matching "${search}"`
                : 'No events available'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
