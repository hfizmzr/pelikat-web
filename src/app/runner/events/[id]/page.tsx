import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, QrCode, Image as ImageIcon, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RunnerRegistrationActions } from '@/components/events/runner-registration-actions'

interface RaceCategory {
  id: string
  name: string
  gender: string | null
  min_age: number | null
  max_age: number | null
  price: number | null
  max_slots: number | null
}

export default async function RunnerEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: event } = await supabase
    .from('events')
    .select('*, organizers(name), race_categories(*)')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const { data: registration } = await supabase
    .from('registrations')
    .select('*, race_categories(*)')
    .eq('event_id', id)
    .eq('runner_id', profile?.id)
    .single()

  const isRegistered = !!registration
  const raceCategories = (event.race_categories ?? []) as RaceCategory[]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/runner/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
            <Badge variant={event.status === 'published' ? 'default' : 'secondary'}>
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
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>About This Event</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {event.description || 'No description available'}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle>Race Categories</CardTitle>
              <CardDescription>Available categories for this event</CardDescription>
            </CardHeader>
            <CardContent>
              {raceCategories.length > 0 ? (
                <div className="space-y-4">
                  {raceCategories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div>
                        <p className="font-medium">{cat.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {cat.gender} | Ages {cat.min_age || 'Open'}-{cat.max_age || 'Open'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${cat.price}</p>
                        {cat.max_slots && (
                          <p className="text-xs text-muted-foreground">{cat.max_slots} slots</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No categories available</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Registration Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isRegistered ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-500">
                    <Badge variant="default">Registered</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">BIB Number</span>
                      <span className="font-mono font-bold">{registration.bib_number}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Category</span>
                      <span>{registration.race_categories?.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={registration.payment_status === 'paid' ? 'default' : 'secondary'}>
                        {registration.payment_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Link href={`/runner/events/${event.id}/bib`} className="block">
                      <Button className="w-full">
                        <QrCode className="mr-2 h-4 w-4" />
                        View Digital BIB
                      </Button>
                    </Link>
                    <Link href={`/runner/events/${event.id}/gallery`} className="block">
                      <Button variant="outline" className="w-full">
                        <ImageIcon className="mr-2 h-4 w-4" />
                        My Photos
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <RunnerRegistrationActions
                  eventId={event.id}
                  categories={raceCategories}
                  hasRunnerProfile={!!profile}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle>Organizer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{event.organizers?.name || 'Unknown'}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
