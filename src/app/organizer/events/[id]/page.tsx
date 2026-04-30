import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, MapPin, Users, Clock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EventSettingsPanel } from '@/components/events/event-settings-panel'

export default async function OrganizerEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select(`
      *,
      race_categories(*),
      registrations(*, runner_profiles(*), race_categories(*))
    `)
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const stats = {
    totalRegistrations: event.registrations?.length || 0,
    checkedIn: event.registrations?.filter((r: any) => r.checked_in).length || 0,
    categories: event.race_categories?.length || 0,
  }

  const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
    published: 'default',
    draft: 'secondary',
    closed: 'outline',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/organizer/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
            <Badge variant={statusVariant[event.status] ?? 'secondary'}>
              {event.status}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="h-4 w-4" />
            {new Date(event.event_date).toLocaleDateString()}
            {event.location && (
              <>
                <MapPin className="h-4 w-4 ml-2" />
                {event.location}
              </>
            )}
          </p>
        </div>

        {/* Settings panel — client component with delete + status update */}
        <EventSettingsPanel
          eventId={event.id}
          currentStatus={event.status}
          eventName={event.name}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRegistrations}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.checkedIn}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.categories}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Event Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {event.description || 'No description provided'}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href={`/organizer/events/${event.id}/checkin`} className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    Check-in Dashboard
                  </Button>
                </Link>
                <Link href={`/organizer/events/${event.id}/photos`} className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Clock className="mr-2 h-4 w-4" />
                    Photo Management
                  </Button>
                </Link>
                <Link href={`/organizer/events/${event.id}/leaderboard`} className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    Leaderboard
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader>
                <CardTitle>Race Categories</CardTitle>
              </CardHeader>
              <CardContent>
                {event.race_categories && event.race_categories.length > 0 ? (
                  <div className="space-y-2">
                    {event.race_categories.map((cat: any) => (
                      <div key={cat.id} className="flex items-center justify-between">
                        <span className="text-sm">{cat.name}</span>
                        <Badge variant="outline">{cat.gender || "O"}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">No categories yet</p>
                    <Link href={`/organizer/events/${event.id}/categories`}>
                      <Button size="sm" variant="outline">Manage Categories</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="registrations" className="space-y-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Registrations</CardTitle>
              <CardDescription>All runner registrations for this event</CardDescription>
            </CardHeader>
            <CardContent>
              {event.registrations && event.registrations.length > 0 ? (
                <div className="space-y-4">
                  {event.registrations.slice(0, 10).map((reg: any) => (
                    <div key={reg.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="font-medium">{reg.runner_profiles?.full_name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">
                          BIB: {reg.bib_number} | {reg.race_categories?.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={reg.checked_in ? 'default' : 'secondary'}>
                          {reg.checked_in ? 'Checked In' : 'Not Checked In'}
                        </Badge>
                        <Badge variant={reg.payment_status === 'paid' ? 'default' : 'outline'}>
                          {reg.payment_status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No registrations yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Race Categories</CardTitle>
                <CardDescription>Manage race categories for this event</CardDescription>
              </div>
              <Link href={`/organizer/events/${event.id}/categories`}>
                <Button size="sm" variant="outline">Manage All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {event.race_categories && event.race_categories.length > 0 ? (
                <div className="space-y-4">
                  {event.race_categories.map((cat: any) => (
                    <div key={cat.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="font-medium">{cat.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {cat.gender} | Ages {cat.min_age}-{cat.max_age}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">${cat.price}</Badge>
                        {cat.max_slots && <Badge variant="secondary">{cat.max_slots} slots</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No categories yet</p>
                  <Link href={`/organizer/events/${event.id}/categories`}>
                    <Button>Add Category</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}