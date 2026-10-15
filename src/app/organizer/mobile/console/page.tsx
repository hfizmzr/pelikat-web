import { Banknote, Calendar, ChevronRight, ClipboardList, Gauge, MapPin, QrCode, Tags, Trophy, UserPlus, Users } from "lucide-react"
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'

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

  // Get active event first, fallback to nearest upcoming
  const { data: activeEvent } = await supabase
    .from('events')
    .select(`
      id, name, status, event_date, location,
      race_categories(id, name, max_slots, bib_prefix),
      registrations(id, payment_status, checked_in, created_at, race_category_id)
    `)
    .eq('organizer_id', organizerId)
    .in('status', ['active', 'published'])
    .order('event_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!activeEvent) return null

  const regs = (activeEvent.registrations || []) as Array<{
    id: string
    payment_status: string
    checked_in: boolean
    created_at: string
    race_category_id: string | null
  }>
  const cats = (activeEvent.race_categories || []) as Array<{
    id: string
    name: string
    max_slots: number
    bib_prefix: string
  }>

  const totalRegs = regs.length
  const checkedIn = regs.filter((r) => r.checked_in).length
  const paid = regs.filter((r) => r.payment_status === 'paid').length
  const pending = regs.filter((r) => r.payment_status === 'pending').length
  const checkInRate = totalRegs > 0 ? Math.round((checkedIn / totalRegs) * 100) : 0

  // Category breakdown
  const catBreakdown = cats.map((cat) => {
    const catRegs = regs.filter((r) => r.race_category_id === cat.id)
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
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
          <div className="h-14 flex items-center">
            <span className="text-[16px] font-bold text-foreground">Race Console</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-muted-foreground">
          <Gauge className="size-[48px] mb-3" />
          <p className="text-[14px] font-medium">No active event</p>
          <p className="text-[12px] mt-1">Activate an event to see the race console</p>
          <Link
            href="/organizer/mobile/events"
            className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold"
          >
            View Events
          </Link>
        </div>
      </div>
    )
  }

  const { event, totalRegs, checkedIn, paid, pending, checkInRate, catBreakdown } = data
  const isLive = event.status === 'active'

  return (
    <div className="flex flex-col w-full bg-background min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[16px] font-bold text-foreground">Race Console</span>
              {isLive && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping" />
                  <span className="text-[9px] font-bold text-success uppercase tracking-wider">Live</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">{event.name}</p>
          </div>
          <Link
            href={`/organizer/mobile/scanner`}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold"
          >
            <QrCode className="size-[13px]" />
            Scan
          </Link>
        </div>
      </header>

      <div className="flex flex-col px-4 py-4 space-y-5">

        {/* Event Banner */}
        <div className="relative overflow-hidden rounded-xl bg-card p-4 shadow-md border border-border/40">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
              {isLive ? 'Active Production Pipeline' : 'Upcoming Event'}
            </span>
            <h1 className="text-[20px] font-extrabold text-foreground leading-tight mt-0.5">{event.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground mt-1.5">
              <span className="flex items-center gap-1">
                <Calendar className="size-[13px] text-primary" />
                {new Date(event.date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-[13px] text-success" />
                  {event.location}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI Grid 2x2 */}
        <section className="space-y-2">
          <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
            Critical Ops Status <span className="text-primary ml-2">• Sync: Live</span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                icon: UserPlus,
                label: 'Check-in Velocity',
                value: checkedIn.toLocaleString(),
                badge: `${checkInRate}%`,
                color: { bg: 'bg-primary/10', text: 'text-primary', badge: 'bg-primary/10 text-primary', bar: 'bg-primary' },
                barPct: checkInRate,
                sub: `${totalRegs} total runner kits`,
              },
              {
                icon: Banknote,
                label: 'Confirmed Paid',
                value: paid.toLocaleString(),
                badge: totalRegs > 0 ? `${Math.round((paid / totalRegs) * 100)}%` : '0%',
                color: { bg: 'bg-primary/10', text: 'text-primary', badge: 'bg-primary/10 text-primary', bar: 'bg-primary' },
                barPct: totalRegs > 0 ? Math.round((paid / totalRegs) * 100) : 0,
                sub: `${pending} pending payment`,
              },
              {
                icon: Users,
                label: 'Total Registered',
                value: totalRegs.toLocaleString(),
                badge: 'All',
                color: { bg: 'bg-success/10', text: 'text-success', badge: 'bg-success/10 text-success', bar: 'bg-success' },
                barPct: 100,
                sub: `${catBreakdown.length} categories`,
              },
              {
                icon: ClipboardList,
                label: 'Not Checked In',
                value: (totalRegs - checkedIn).toLocaleString(),
                badge: `${100 - checkInRate}%`,
                color: { bg: 'bg-red-500/10 dark:bg-red-300/10', text: 'text-red-500 dark:text-red-300', badge: 'bg-red-500/10 dark:bg-red-300/10 text-red-500 dark:text-red-300', bar: 'bg-red-500 dark:bg-red-300' },
                barPct: 100 - checkInRate,
                sub: 'Awaiting collection',
              },
            ].map((kpi, i) => (
              <div key={i} className="flex flex-col justify-between p-4 rounded-xl bg-card border border-border/40 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className={`p-1.5 rounded-lg ${kpi.color.bg} ${kpi.color.text}`}>
                    <kpi.icon className="size-[18px]" />
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kpi.color.badge}`}>
                    {kpi.badge}
                  </span>
                </div>
                <div className="mt-4">
                  <span className="block text-[10px] leading-[14px] text-muted-foreground font-medium">{kpi.label}</span>
                  <p className="text-[22px] leading-[28px] font-bold text-foreground mt-0.5">{kpi.value}</p>
                  <div className="w-full bg-accent rounded-full h-1.5 mt-2 overflow-hidden">
                    <div className={`${kpi.color.bar} h-full rounded-full`} style={{ width: `${kpi.barPct}%` }} />
                  </div>
                  <span className="block text-[10px] text-muted-foreground mt-1.5">{kpi.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Category breakdown */}
        {catBreakdown.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Category Breakdown
            </h2>
            <div className="rounded-xl bg-card border border-border/40 overflow-hidden">
              {catBreakdown.map((cat, i) => (
                <div
                  key={cat.id}
                  className={`p-4 flex items-center gap-3 ${i > 0 ? 'border-t border-border/40' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-semibold text-foreground truncate">{cat.name}</span>
                      <span className="text-[11px] text-primary font-bold shrink-0">{cat.fillPct}%</span>
                    </div>
                    <div className="w-full bg-accent rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${cat.fillPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground">{cat.registered} registered</span>
                      <span className="text-[10px] text-muted-foreground">{cat.checkedIn} checked in</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick links */}
        <section className="pb-4">
          <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Operations
          </h2>
          <div className="flex flex-col gap-2">
            {[
              { href: `/organizer/events/${event.id}/checkin`, icon: QrCode, label: 'Full Check-in Scanner', color: 'text-primary' },
              { href: `/organizer/events/${event.id}/registrations`, icon: Users, label: 'Registrations List', color: 'text-primary' },
              { href: `/organizer/events/${event.id}/leaderboard`, icon: Trophy, label: 'Live Leaderboard', color: 'text-success' },
              { href: `/organizer/events/${event.id}/categories`, icon: Tags, label: 'Race Categories', color: 'text-primary' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border/40 active:scale-95 transition-transform"
              >
                <span className={`size-[20px] ${link.color}`}><link.icon className="size-[20px]" /></span>
                <span className="text-[13px] font-medium text-foreground flex-1">{link.label}</span>
                <ChevronRight className="size-[16px] text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
