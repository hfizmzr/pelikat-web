import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, MapPin, Users, MoreHorizontal, Flag } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Events - Pelikat',
  description: 'Manage your running events',
}

export default async function OrganizerEventsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let organizerId = user?.app_metadata?.organizer_id as string | undefined

  if (!organizerId) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Events</h1>
            <p className="text-muted-foreground">Manage your running events</p>
          </div>
        </div>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No organizer profile found for this account</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch real rows (not aggregate) so we can compute counts client-side
  const { data: events, error } = await supabase
    .from('events')
    .select(`
      *,
      race_categories(id),
      registrations(id, checked_in)
    `)
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching events:', error)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground">Manage your running events</p>
        </div>
        <Link href="/organizer/events/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Event
          </Button>
        </Link>
      </div>

      {events && events.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const regs: { id: string; checked_in: boolean }[] = event.registrations || []
            const checkedIn = regs.filter((r) => r.checked_in).length
            const totalRegs = regs.length
            const categoryCount = (event.race_categories as { id: string }[] | null)?.length ?? 0

            return (
              <Card key={event.id} className="border-border overflow-hidden">
                <div className="h-2 bg-primary" />
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(event.event_date).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <Badge variant={event.status === 'published' ? 'default' : 'secondary'}>
                      {event.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {event.location && (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
                      <MapPin className="h-3 w-3" />
                      {event.location}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-sm mb-4">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{totalRegs} registrations</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {checkedIn} checked in
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs">
                        {categoryCount} categories
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/organizer/events/${event.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      {/* <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button> */}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No events yet</p>
            <Link href="/organizer/events/new">
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Create your first event
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}