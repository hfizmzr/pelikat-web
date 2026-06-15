'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Ticket, CheckCircle, Clock, CreditCard } from 'lucide-react'
import Link from 'next/link'

interface RegisteredEvent {
  id: string
  event_id: string
  bib_number: string
  payment_status: 'pending' | 'paid' | 'refunded'
  checked_in: boolean
  events: { name: string; event_date: string; location?: string; status: string }
  race_categories: { name: string }
}

interface Props {
  registrations: RegisteredEvent[]
}

export default function RegisteredEventsSection({ registrations }: Props) {
  const [period, setPeriod] = useState<'all' | 'upcoming' | 'past'>('all')

  if (!registrations || registrations.length === 0) return null

  const now = new Date()
  const filtered = registrations.filter(reg => {
    const eventDate = new Date(reg.events.event_date)
    if (period === 'upcoming') return eventDate >= now
    if (period === 'past') return eventDate < now
    return true
  })

  const upcomingCount = registrations.filter(r => new Date(r.events.event_date) >= now).length
  const pastCount = registrations.filter(r => new Date(r.events.event_date) < now).length

  const tabs = [
    { label: 'All Events', value: 'all' as const, count: registrations.length },
    { label: 'Upcoming', value: 'upcoming' as const, count: upcomingCount },
    { label: 'Past', value: 'past' as const, count: pastCount },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">My Registered Events</h2>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setPeriod(tab.value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              <span className={`text-xs ${period === tab.value ? 'text-muted-foreground' : ''}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {period === 'upcoming'
                ? 'No upcoming registered events. Browse below to find your next race!'
                : period === 'past'
                  ? 'No past registered events.'
                  : 'No registered events.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(reg => {
            const eventDate = new Date(reg.events.event_date)
            const isPast = eventDate < now

            return (
              <Card
                key={reg.id}
                className={`border-border overflow-hidden ${isPast ? 'opacity-75' : ''}`}
              >
                <div
                  className={`h-1.5 ${isPast ? 'bg-muted-foreground/30' : 'bg-green-500'}`}
                />
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/runner/events/${reg.event_id}`} className="hover:underline">
                        <CardTitle className="text-base truncate">
                          {reg.events.name}
                        </CardTitle>
                      </Link>
                      <CardDescription className="flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {eventDate.toLocaleDateString()}
                        {reg.events.location && (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{reg.events.location}</span>
                          </>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">BIB</span>
                      <span className="font-mono text-lg font-bold tracking-wider">
                        {reg.bib_number}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {reg.race_categories?.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={reg.payment_status === 'paid' ? 'default' : reg.payment_status === 'refunded' ? 'outline' : 'secondary'}
                      className="gap-1"
                    >
                      <CreditCard className="h-3 w-3" />
                      {reg.payment_status === 'paid'
                        ? 'Paid'
                        : reg.payment_status === 'refunded'
                          ? 'Refunded'
                          : 'Pending'}
                    </Badge>
                    {reg.checked_in ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Checked In
                      </Badge>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Not checked in
                      </span>
                    )}
                  </div>

                  <Button size="sm" variant="outline" className="w-full" asChild>
                    <Link href={`/runner/events/${reg.event_id}`}>
                      View Details
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
