import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, MapPin, Users, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'

export default async function OrganizerEventsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  const { data: events } = await supabase
    .from('events')
    .select(`
      *,
      race_categories(count),
      registrations(count, checked_in)
    `)
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false })

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events?.map((event) => {
          const checkedIn = event.registrations?.reduce((acc: number, r: any) => acc + (r.checked_in ? 1 : 0), 0) || 0
          const totalRegs = event.registrations?.reduce((acc: number, r: any) => acc + r.count, 0) || 0

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
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {checkedIn} checked in
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">
                      {event.race_categories?.[0]?.count || 0} categories
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Link href={`/organizer/events/${event.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {(!events || events.length === 0) && (
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

function Flag({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}