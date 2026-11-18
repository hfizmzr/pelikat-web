import { StatusTag, statusLabel, type StatusTone } from '@/components/ui/status-tag'
import { malaysiaToday } from '@/lib/event-dates'
import { Calendar, CalendarDays, CalendarX, MapPin, Plus, QrCode } from "lucide-react"
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'

async function getOrganizerEvents() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id
  if (!organizerId) return []

  const { data: events } = await supabase
    .from('events')
    .select(`
      id, name, status, event_date, location, description,
      race_categories(id, name, max_slots),
      registrations(id, payment_status, checked_in)
    `)
    .eq('organizer_id', organizerId)
    .order('event_date', { ascending: false })

  return (events || []).map((e) => {
    const regs = (e.registrations || []) as Array<{ payment_status: string; checked_in: boolean }>
    const cats = (e.race_categories || []) as Array<{ id: string; name: string; max_slots: number }>
    const totalSlots = cats.reduce((a, c) => a + (c.max_slots || 0), 0)
    const checkedIn = regs.filter((r) => r.checked_in).length
    const registered = regs.length
    const checkInPct = registered > 0 ? Math.round((checkedIn / registered) * 100) : 0

    return {
      id: e.id,
      name: e.name,
      status: e.status,
      date: e.event_date,
      location: e.location,
      totalSlots,
      registered,
      checkedIn,
      checkInPct,
      catCount: cats.length,
    }
  })
}

function statusChip(status: string) {
  const labels: Record<string, string> = { active: 'Live', published: 'Open', completed: 'Done' }
  const tones: Record<string, StatusTone> = { active: 'success', published: 'success', draft: 'neutral', completed: 'neutral', closed: 'neutral', cancelled: 'destructive' }
  return <StatusTag tone={tones[status] ?? 'neutral'}>{labels[status] ?? statusLabel(status)}</StatusTag>
}

export default async function OrganizerMobileEventsPage() {
  const events = await getOrganizerEvents()
  // Compare Malaysian calendar dates: `new Date(date) >= now` moved a race
  // into Past at 08:00 on race morning (event_date parses as UTC midnight).
  // Drafts stay listed here; this is the organizer's own event list.
  const today = malaysiaToday()
  const upcoming = events.filter((e) => e.date >= today)
  const past = events.filter((e) => e.date < today)

  return (
    <div className="flex flex-col w-full bg-background min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between">
          <div>
            <span className="text-[16px] font-medium text-foreground">My events</span>
            <p className="text-[11px] text-muted-foreground">{events.length} total • {upcoming.length} upcoming</p>
          </div>
          <Link
            href="/organizer/mobile/events/new"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium active:scale-[0.98] transition-transform"
          >
            <Plus className="size-[14px]" />
            New
          </Link>
        </div>
      </header>

      <div className="flex flex-col px-4 py-4 space-y-5">

        {/* Upcoming Events */}
        {upcoming.length > 0 && (
          <section>
            <h2 className="text-[12px] font-medium text-muted-foreground mb-3">
              Upcoming
            </h2>
            <div className="flex flex-col gap-3">
              {upcoming.map((event) => (
                <div key={event.id} className="rounded-xl bg-card border border-border/40 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-[15px] font-medium text-foreground flex-1 leading-snug">
                        {event.name}
                      </h3>
                      {statusChip(event.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-[13px] text-primary" />
                        {new Date(event.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-[13px] text-success" />
                          {event.location}
                        </span>
                      )}
                    </div>

                    {/* Check-in progress */}
                    <div className="mb-3">
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>{event.checkedIn} / {event.registered} checked in</span>
                        <span className="text-primary font-medium">{event.checkInPct}%</span>
                      </div>
                      <div className="w-full bg-accent rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${event.checkInPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Link
                        href={`/organizer/mobile/scanner`}
                        className="flex-1 flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background text-foreground text-[13px] font-medium active:scale-[0.98] transition-transform"
                      >
                        <QrCode className="size-[14px]" />
                        Check-in
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Past Events */}
        {past.length > 0 && (
          <section>
            <h2 className="text-[12px] font-medium text-muted-foreground mb-3">
              Past events
            </h2>
            <div className="flex flex-col gap-2">
              {past.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/30"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <CalendarDays className="size-[18px] text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-muted-foreground truncate">{event.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(event.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} • {event.registered} runners
                    </p>
                  </div>
                  {statusChip(event.status)}
                </div>
              ))}
            </div>
          </section>
        )}

        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CalendarX className="size-[48px] mb-3" />
            <p className="text-[14px] font-medium">No events yet</p>
            <p className="text-[12px] mt-1">Create your first running event</p>
            <Link
              href="/organizer/mobile/events/new"
              className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium"
            >
              Create event
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
