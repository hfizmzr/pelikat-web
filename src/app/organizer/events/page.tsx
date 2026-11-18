import { ArrowRight, Calendar, Flag, MapPin, Plus, QrCode } from "lucide-react"
import { StatusTag } from '@/components/ui/status-tag'
import { createClient } from '@/lib/supabase/server'
import { isConfirmedStatus } from '@/lib/registration-status'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Events - Pelikat',
  description: 'Your running events and their categories',
}


function EventListHeader() {
  return (
    <div className="hidden px-5 pb-2 text-[12px] text-muted-foreground md:grid md:grid-cols-[minmax(0,2.2fr)_110px_repeat(3,84px)_minmax(0,1.2fr)_auto] md:gap-6">
      <span>Event</span>
      <span>Status</span>
      <span className="text-right">Registered</span>
      <span className="text-right">Confirmed</span>
      <span className="text-right">Checked in</span>
      <span>Capacity</span>
      <span className="w-[196px]" />
    </div>
  )
}

export default async function OrganizerEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id as string | undefined

  if (!organizerId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Flag className="size-10 mb-4" strokeWidth={1.5} />
        <h2 className="text-[18px] leading-[24px] font-medium text-foreground mb-2">No organizer profile</h2>
        <p className="text-[14px]">No organizer account is linked to this user.</p>
      </div>
    )
  }

  const { data: events, error } = await supabase
    .from('events')
    .select(`
      id, name, status, event_date, location, description,
      race_categories(id, name, max_slots),
      registrations(id, payment_status, checked_in)
    `)
    .eq('organizer_id', organizerId)
    .order('event_date', { ascending: false })

  if (error) console.error('Error fetching events:', error)

  const now = new Date()
  const upcoming = events?.filter(e => new Date(e.event_date) >= now) || []
  const past = events?.filter(e => new Date(e.event_date) < now) || []

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  const EventRow = ({ event }: { event: NonNullable<typeof events>[0] }) => {
    const regs = event.registrations || []
    const paid = regs.filter((r: { payment_status: string }) => isConfirmedStatus(r.payment_status)).length
    const checkedIn = regs.filter((r: { checked_in: boolean }) => r.checked_in).length
    const cats = event.race_categories || []
    const totalCap = cats.reduce((a: number, c: { max_slots?: number | null }) => a + (c.max_slots || 0), 0)
    const fillPct = totalCap > 0 ? Math.round((regs.length / totalCap) * 100) : 0
    const daysLeft = Math.ceil((new Date(event.event_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return (
      <li className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_110px_repeat(3,84px)_minmax(0,1.2fr)_auto] md:items-center md:gap-6">
        <div className="min-w-0">
          <Link href={`/organizer/events/${event.id}`} className="block truncate text-[15px] font-medium text-foreground hover:underline underline-offset-4">
            {event.name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5 shrink-0" strokeWidth={1.75} />
              {fmtDate(event.event_date)}
              {daysLeft > 0 && daysLeft < 60 && <span>· in {daysLeft} days</span>}
            </span>
            {event.location && (
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </p>
        </div>
        <div><StatusTag status={event.status} /></div>
        {[
          { label: 'Registered', value: regs.length },
          { label: 'Confirmed', value: paid },
          { label: 'Checked in', value: checkedIn },
        ].map(stat => (
          <div key={stat.label} className="flex items-baseline justify-between gap-2 md:block md:text-right">
            <span className="text-[12px] text-muted-foreground md:hidden">{stat.label}</span>
            <span className="text-[15px] tabular-nums text-foreground">{stat.value.toLocaleString()}</span>
          </div>
        ))}
        <div className="min-w-0">
          {totalCap > 0 ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${fillPct >= 90 ? 'bg-warning' : 'bg-primary'}`}
                  style={{ width: `${Math.max(fillPct, 1)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[12px] tabular-nums text-muted-foreground">
                {regs.length.toLocaleString()} of {totalCap.toLocaleString()} places · {cats.length} {cats.length === 1 ? 'category' : 'categories'}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">{cats.length} {cats.length === 1 ? 'category' : 'categories'} · no limit</p>
          )}
        </div>
        <div className="flex items-center gap-1 md:justify-end">
          <Link
            href={`/organizer/events/${event.id}/checkin`}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <QrCode className="size-4" strokeWidth={1.75} />
            Check-in
          </Link>
          <Link
            href={`/organizer/events/${event.id}`}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            Manage
            <ArrowRight className="size-3.5" strokeWidth={1.75} />
          </Link>
        </div>
      </li>
    )
  }


  const totalRunners = events?.reduce((a, e) => a + (e.registrations?.length || 0), 0) ?? 0
  const publishedCount = events?.filter(e => e.status === 'published').length ?? 0

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Events</h1>
          {events && events.length > 0 && (
            <p className="mt-1 text-[14px] text-muted-foreground">
              {events.length} events · {publishedCount} published · {upcoming.length} upcoming · {totalRunners.toLocaleString()} runners
            </p>
          )}
        </div>

        {upcoming.length > 0 && (
          <section aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="mb-3 text-[16px] font-medium text-foreground">
              Upcoming <span className="ml-1 font-normal text-muted-foreground tabular-nums">{upcoming.length}</span>
            </h2>
            <EventListHeader />
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {upcoming.map(event => <EventRow key={event.id} event={event} />)}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section aria-labelledby="past-title">
            <h2 id="past-title" className="mb-3 text-[16px] font-medium text-foreground">
              Past <span className="ml-1 font-normal text-muted-foreground tabular-nums">{past.length}</span>
            </h2>
            <EventListHeader />
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {past.map(event => <EventRow key={event.id} event={event} />)}
            </ul>
          </section>
        )}

        {(!events || events.length === 0) && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-16 text-center">
            <h3 className="text-[18px] font-medium text-foreground">No events yet</h3>
            <p className="mt-2 max-w-sm text-[14px] text-muted-foreground">
              Create your first event to add categories and start taking registrations
            </p>
            <Link
              href="/organizer/events/new"
              className="mt-6 flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" strokeWidth={2} />
              Create event
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
