import { ArrowRight, Badge, Banknote, Calendar, CalendarClock, CircleCheck, CirclePlus, ClipboardCheck, Flag, MapPin, QrCode, Users } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Race Events & Waves - Organizer Hub | Pelikat',
  description: 'Manage your running events, race waves, and category configurations',
}

export default async function OrganizerEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id as string | undefined

  if (!organizerId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <span className="size-[64px] mb-4"><Flag className="size-[64px] mb-4" /></span>
        <h2 className="text-[18px] leading-[24px] font-semibold text-foreground mb-2">No organizer profile</h2>
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

  const statusStyles: Record<string, string> = {
    published: 'text-success bg-success/15 border-success/20',
    draft: 'text-muted-foreground bg-accent border-border',
    closed: 'text-red-300 bg-red-300/15 border-red-300/20',
    cancelled: 'text-red-300 bg-red-300/15 border-red-300/20',
  }

  const EventCard = ({ event }: { event: NonNullable<typeof events>[0] }) => {
    const regs = event.registrations || []
    const paid = regs.filter((r: { payment_status: string }) => r.payment_status === 'paid').length
    const checkedIn = regs.filter((r: { checked_in: boolean }) => r.checked_in).length
    const cats = event.race_categories || []
    const totalCap = cats.reduce((a: number, c: { max_slots?: number | null }) => a + (c.max_slots || 0), 0)
    const fillPct = totalCap > 0 ? Math.round((regs.length / totalCap) * 100) : 0
    const daysLeft = Math.ceil((new Date(event.event_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return (
      <div className="bg-card rounded-xl border border-muted overflow-hidden group hover:border-primary/30 transition-all ">
        <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-primary" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex flex-col gap-1 min-w-0">
              <h3 className="text-[16px] leading-[24px] font-semibold text-foreground group-hover:text-primary transition-colors">{event.name}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1">
                  <span className="size-[14px]"><Calendar className="size-[14px]" /></span>
                  {new Date(event.event_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {daysLeft > 0 && daysLeft < 60 && (
                  <span className="text-[10px] leading-[14px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {daysLeft}d left
                  </span>
                )}
              </div>
            </div>
            <span className={`shrink-0 text-[10px] leading-[14px] px-2.5 py-1 rounded-full font-semibold border ${statusStyles[event.status] || statusStyles.draft}`}>
              {event.status}
            </span>
          </div>

          {event.location && (
            <p className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1 mb-4">
              <span className="size-[14px]"><MapPin className="size-[14px]" /></span>
              {event.location}
            </p>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { icon: Badge, label: 'Registered', value: regs.length },
              { icon: Banknote, label: 'Paid', value: paid },
              { icon: ClipboardCheck, label: 'Checked In', value: checkedIn },
            ].map(stat => (
              <div key={stat.label} className="bg-card rounded-lg p-2.5 flex flex-col gap-0.5">
                <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-foreground">{stat.value}</span>
                <span className="text-[10px] leading-[14px] text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Fill bar */}
          {totalCap > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>{regs.length} of {totalCap} slots</span>
                <span className={fillPct >= 90 ? 'text-red-300 font-semibold' : 'text-muted-foreground'}>{fillPct}%</span>
              </div>
              <div className="w-full bg-accent rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${fillPct >= 90 ? 'bg-red-300' : fillPct >= 70 ? 'bg-primary' : 'bg-primary'}`}
                  style={{ width: `${Math.max(fillPct, 1)}%` }}
                />
              </div>
            </div>
          )}

          {/* Categories tags */}
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {cats.slice(0, 3).map((cat: { id: string; name: string }) => (
                <span key={cat.id} className="text-[10px] leading-[14px] px-2 py-0.5 rounded border border-border text-muted-foreground">
                  {cat.name}
                </span>
              ))}
              {cats.length > 3 && (
                <span className="text-[10px] leading-[14px] px-2 py-0.5 rounded border border-border text-muted-foreground">
                  +{cats.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-muted">
            <div className="flex gap-1.5">
              <Link href={`/organizer/events/${event.id}/registrations`}>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Registrations">
                  <span className="size-[18px]"><Badge className="size-[18px]" /></span>
                </button>
              </Link>
              <Link href={`/organizer/events/${event.id}/checkin`}>
                <button className="p-2 rounded-lg text-muted-foreground hover:text-success hover:bg-accent transition-colors" title="Check-in">
                  <span className="size-[18px]"><QrCode className="size-[18px]" /></span>
                </button>
              </Link>
            </div>
            <Link href={`/organizer/events/${event.id}`}>
              <button className="px-4 py-2 bg-card hover:bg-accent text-foreground text-[12px] leading-[16px] tracking-[0.02em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-border">
                Manage
                <span className="size-[16px]"><ArrowRight className="size-[16px]" /></span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      {/* Ambient */}
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase">
                Event Console
              </span>
            </div>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">Race Events & Waves</h1>
            <p className="text-[14px] leading-[20px] text-muted-foreground">Create, configure, and manage your running events and race categories.</p>
          </div>
          <Link href="/organizer/events/new">
            <button className="px-5 py-2.5 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all whitespace-nowrap">
              <span className="size-[18px]"><CirclePlus className="size-[18px]" /></span>
              Create Event
            </button>
          </Link>
        </div>

        {/* Summary bar */}
        {events && events.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Events', value: events.length, icon: Flag, color: 'text-primary' },
              { label: 'Published', value: events.filter(e => e.status === 'published').length, icon: CircleCheck, color: 'text-success' },
              { label: 'Upcoming', value: upcoming.length, icon: CalendarClock, color: 'text-primary' },
              { label: 'Total Runners', value: events.reduce((a, e) => a + (e.registrations?.length || 0), 0), icon: Users, color: 'text-primary' },
            ].map(s => (
              <div key={s.label} className="bg-card rounded-xl p-4 border border-muted flex items-center gap-3">
                <span className={`size-[24px] ${s.color}`}><s.icon className="size-[24px]" /></span>
                <div>
                  <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-foreground">{s.value.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Events */}
        {upcoming.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <h2 className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-foreground">Upcoming Events</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold">{upcoming.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map(event => <EventCard key={event.id} event={event} />)}
            </div>
          </section>
        )}

        {/* Past Events */}
        {past.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-muted-foreground">Past Events</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground font-semibold">{past.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
              {past.map(event => <EventCard key={event.id} event={event} />)}
            </div>
          </section>
        )}

        {/* Empty state */}
        {(!events || events.length === 0) && (
          <div className="bg-card rounded-xl border border-muted p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <span className="size-[48px] text-primary"><Flag className="size-[48px] text-primary" /></span>
            </div>
            <h3 className="text-[22px] leading-[28px] font-semibold text-foreground mb-2">No events yet</h3>
            <p className="text-[14px] leading-[20px] text-muted-foreground mb-8 max-w-sm">
              Create your first race event to start building waves, accepting registrations, and managing participants.
            </p>
            <Link href="/organizer/events/new">
              <button className="px-6 py-3 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all ">
                <span className="size-[18px]"><CirclePlus className="size-[18px]" /></span>
                Create your first event
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}