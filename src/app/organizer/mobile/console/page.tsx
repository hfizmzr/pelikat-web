import { Calendar, ChevronRight, MapPin, QrCode, Tags, Trophy, Users } from "lucide-react"
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isConfirmedStatus } from '@/lib/registration-status'
import Link from 'next/link'
import { StatusTag } from '@/components/ui/status-tag'
import { RACE_CONSOLE_STATUSES, isRaceDay, malaysiaToday } from '@/lib/event-dates'

async function getActiveEventOpsData() {
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
  if (!organizerId) return null

  // The nearest race that is today or still ahead (Malaysian date). Without
  // the date bound this picked the oldest published event, past or not.
  const today = malaysiaToday()
  const { data: activeEvent } = await supabase
    .from('events')
    .select(`
      id, name, status, event_date, location,
      race_categories(id, name, max_slots, bib_prefix),
      registrations(id, payment_status, checked_in, created_at, category_id)
    `)
    .eq('organizer_id', organizerId)
    .in('status', [...RACE_CONSOLE_STATUSES])
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('id', { ascending: true }) // tie-breaker shared with home and scanner
    .limit(1)
    .maybeSingle()

  if (!activeEvent) return null

  const regs = (activeEvent.registrations || []) as Array<{
    id: string
    payment_status: string
    checked_in: boolean
    created_at: string
    category_id: string | null  }>
  const cats = (activeEvent.race_categories || []) as Array<{
    id: string
    name: string
    max_slots: number
    bib_prefix: string
  }>

  const totalRegs = regs.length
  const checkedIn = regs.filter((r) => r.checked_in).length
  const paid = regs.filter((r) => isConfirmedStatus(r.payment_status)).length
  const pending = regs.filter((r) => r.payment_status === 'pending').length
  const checkInRate = totalRegs > 0 ? Math.round((checkedIn / totalRegs) * 100) : 0

  // Category breakdown
  const catBreakdown = cats.map((cat) => {
    const catRegs = regs.filter((r) => r.category_id === cat.id)
    return {
      id: cat.id,
      name: cat.name,
      maxSlots: cat.max_slots || 0,
      registered: catRegs.length,
      checkedIn: catRegs.filter((r) => r.checked_in).length,
      fillPct: cat.max_slots ? Math.round((catRegs.length / cat.max_slots) * 100) : 0,
    }
  })

  // Recent check-ins (last 10 checked-in regs)
  const recentCheckins = regs
    .filter((r) => r.checked_in)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  return {
    event: {
      id: activeEvent.id,
      name: activeEvent.name,
      status: activeEvent.status,
      date: activeEvent.event_date,
      location: activeEvent.location,
      raceDay: isRaceDay(activeEvent.event_date, today),
    },
    totalRegs,
    checkedIn,
    paid,
    pending,
    checkInRate,
    catBreakdown,
    recentCheckins: recentCheckins.length,
  }
}

export default async function OrganizerMobileConsolePage() {
  const data = await getActiveEventOpsData()

  if (!data) {
    return (
      <div className="flex flex-col min-h-dvh bg-background">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/60 px-5 pt-safe">
          <div className="h-14 flex items-center">
            <span className="text-[16px] font-medium text-foreground">Race console</span>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-[15px] text-foreground">No upcoming event</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Publish an event to see it here on race day</p>
          <Link
            href="/organizer/mobile/events"
            className="mt-5 inline-flex min-h-11 items-center rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-foreground"
          >
            View events
          </Link>
        </div>
      </div>
    )
  }

  const { event, totalRegs, checkedIn, paid, pending, checkInRate, catBreakdown } = data
  const isLive = event.raceDay

  return (
    <div className="flex flex-col w-full bg-background min-h-dvh">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/60 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-medium text-foreground">Race console</span>
              {isLive && <StatusTag tone="success">Live</StatusTag>}
            </div>
            <p className="truncate text-[12px] text-muted-foreground">{event.name}</p>
          </div>
          <Link
            href={`/organizer/mobile/scanner?event=${event.id}`}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <QrCode className="size-4" strokeWidth={1.75} />
            Scan
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-8 px-5 py-5">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="text-[13px] text-muted-foreground">{isLive ? 'Race day' : 'Upcoming event'}</p>
          <h1 className="mt-0.5 text-[20px] leading-7 font-medium text-foreground">{event.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" strokeWidth={1.75} />
              {new Date(event.date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" strokeWidth={1.75} />
                {event.location}
              </span>
            )}
          </p>
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${checkInRate}%` }} />
            </div>
            <p className="mt-1.5 text-[12px] tabular-nums text-muted-foreground">
              {checkedIn} of {totalRegs} checked in · {checkInRate}%
            </p>
          </div>
        </div>

        <section aria-labelledby="race-status">
          <h2 id="race-status" className="mb-3 text-[15px] font-medium text-foreground">Race-day status</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Checked in', value: checkedIn, sub: `${checkInRate}% of ${totalRegs} runners` },
              { label: 'Still to check in', value: totalRegs - checkedIn, sub: 'Awaiting kit collection' },
              { label: 'Confirmed', value: paid, sub: `${pending} pending payment` },
              { label: 'Registered', value: totalRegs, sub: `${catBreakdown.length} ${catBreakdown.length === 1 ? 'category' : 'categories'}` },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-border/60 bg-card p-4">
                <p className="text-[13px] text-muted-foreground">{kpi.label}</p>
                <p className="mt-2 text-[28px] leading-none font-medium tabular-nums text-foreground">{kpi.value.toLocaleString()}</p>
                <p className="mt-2 text-[12px] text-muted-foreground">{kpi.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {catBreakdown.length > 0 && (
          <section aria-labelledby="race-categories">
            <h2 id="race-categories" className="mb-3 text-[15px] font-medium text-foreground">Categories</h2>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
              {catBreakdown.map((cat) => (
                <li key={cat.id} className="p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[14px] text-foreground">{cat.name}</span>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">{cat.fillPct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${cat.fillPct}%` }} />
                  </div>
                  <p className="mt-1.5 text-[12px] tabular-nums text-muted-foreground">
                    {cat.registered} registered · {cat.checkedIn} checked in
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav aria-label="Event tools" className="overflow-hidden rounded-xl border border-border/60 bg-card">
          {[
            { href: `/organizer/events/${event.id}/checkin`, icon: QrCode, label: 'Check-in' },
            { href: `/organizer/events/${event.id}/registrations`, icon: Users, label: 'Registrations' },
            { href: `/organizer/events/${event.id}/leaderboard`, icon: Trophy, label: 'Leaderboard' },
            { href: `/organizer/events/${event.id}/categories`, icon: Tags, label: 'Race categories' },
          ].map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex min-h-12 items-center gap-3 px-4 text-[14px] text-foreground transition-colors hover:bg-muted/60 ${i > 0 ? 'border-t border-border/60' : ''}`}
            >
              <link.icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
              <span className="flex-1">{link.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.75} />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
