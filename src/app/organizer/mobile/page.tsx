import { ChevronRight, Calendar, Gauge, Lock, MapPin, QrCode, ShoppingBag } from "lucide-react"
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isConfirmedStatus } from '@/lib/registration-status'
import Link from 'next/link'
import { StatusTag } from '@/components/ui/status-tag'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { MobileLogoutButton } from '@/components/organizer/mobile-logout-button'

async function getOrganizerDashboardData() {
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

  const [{ data: org }, { data: events }] = await Promise.all([
    supabase.from('organizers').select('name').eq('id', organizerId).maybeSingle(),
    supabase
      .from('events')
      .select(`
        id, name, status, event_date, location,
        race_categories(id, name, max_slots),
        registrations(id, payment_status, checked_in)
      `)
      .eq('organizer_id', organizerId)
      .order('event_date', { ascending: true })
      .limit(5),
  ])

  const now = new Date()
  const upcomingEvents = (events || []).filter(
    (e) => new Date(e.event_date) >= now || e.status === 'active'
  )

  const allRegs = (events || []).flatMap((e) => e.registrations || [])
  const totalRunners = allRegs.length
  const checkedIn = allRegs.filter((r) => r.checked_in).length
  const confirmedRunners = allRegs.filter((r) => isConfirmedStatus(r.payment_status)).length

  // Find the next upcoming event
  const nextEvent = upcomingEvents[0]
  const nextEventCats = (nextEvent?.race_categories || []) as Array<{id: string, name: string, max_slots: number}>
  const nextEventRegs = (nextEvent?.registrations || []) as Array<{payment_status: string, checked_in: boolean}>

  return {
    orgName: org?.name || 'My org',
    totalRunners,
    checkedIn,
    confirmedRunners,
    checkInRate: totalRunners > 0 ? Math.round((checkedIn / totalRunners) * 100) : 0,
    nextEvent: nextEvent
      ? {
          id: nextEvent.id,
          name: nextEvent.name,
          date: nextEvent.event_date,
          location: nextEvent.location,
          status: nextEvent.status,
          totalSlots: nextEventCats.reduce((a, c) => a + (c.max_slots || 0), 0),
          registered: nextEventRegs.length,
          checkedIn: nextEventRegs.filter((r) => r.checked_in).length,
        }
      : null,
    upcomingCount: upcomingEvents.length,
  }
}


export default async function OrganizerMobileHome() {
  const data = await getOrganizerDashboardData()

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-dvh text-muted-foreground">
        <div className="text-center">
          <Lock className="size-[48px] mb-3 block" />
          <p className="text-[14px]">Session expired. Please log in.</p>
          <Link
            href="/login"
            className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium"
          >
            Log in
          </Link>
        </div>
      </div>
    )
  }

  const checkInPercent = data.checkInRate
  const isLive = data.nextEvent?.status === 'active'

  return (
    <div className="flex flex-col w-full min-h-dvh bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md px-5 pt-safe">
        <div className="h-16 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[16px] font-medium text-foreground">Pelikat</p>
            <p className="truncate text-[12px] text-muted-foreground">{data.orgName}</p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle className="w-10 h-10 flex items-center justify-center rounded-full" />
            <MobileLogoutButton />
            <NotificationBell href="/organizer/notifications" />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-8 px-5 pb-8 pt-2">
        {data.nextEvent && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] text-muted-foreground">{isLive ? 'Race in progress' : 'Next event'}</h2>
              {isLive && <StatusTag tone="success">Live</StatusTag>}
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-4">
              <h1 className="text-[20px] leading-7 font-medium text-foreground">{data.nextEvent.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                {data.nextEvent.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" strokeWidth={1.75} />
                    {data.nextEvent.location}
                  </span>
                )}
                <span className="tabular-nums">{data.nextEvent.registered} registered</span>
              </p>
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${checkInPercent}%` }} />
                </div>
                <p className="mt-1.5 text-[12px] tabular-nums text-muted-foreground">
                  {data.checkedIn} of {data.nextEvent.registered} checked in · {checkInPercent}%
                </p>
              </div>
              <Link
                href="/organizer/mobile/scanner"
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-[14px] font-medium text-primary-foreground transition-transform active:scale-[0.98]"
              >
                <QrCode className="size-4" strokeWidth={1.75} />
                Open scanner
              </Link>
            </div>
          </section>
        )}

        <nav aria-label="Shortcuts" className="overflow-hidden rounded-xl border border-border/60 bg-card">
          {[
            { href: '/organizer/mobile/scanner', icon: QrCode, label: 'Bib scanner' },
            { href: '/organizer/mobile/events', icon: Calendar, label: 'My events' },
            { href: '/organizer/mobile/console', icon: Gauge, label: 'Race console' },
            { href: '/organizer/mobile/merch', icon: ShoppingBag, label: 'Kit inventory' },
          ].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 items-center gap-3 px-4 text-[14px] text-foreground transition-colors hover:bg-muted/60 ${i > 0 ? 'border-t border-border/60' : ''}`}
            >
              <item.icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.75} />
            </Link>
          ))}
        </nav>

        <section aria-labelledby="ops-status">
          <h2 id="ops-status" className="mb-3 text-[15px] font-medium text-foreground">Race-day status</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Checked in', value: data.checkedIn, sub: `${checkInPercent}% of runners` },
              { label: 'Registered', value: data.totalRunners, sub: `${data.confirmedRunners} confirmed` },
              { label: 'Upcoming events', value: data.upcomingCount, sub: 'Published' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border/60 bg-card p-4">
                <p className="text-[13px] text-muted-foreground">{k.label}</p>
                <p className="mt-2 text-[28px] leading-none font-medium tabular-nums text-foreground">{k.value.toLocaleString()}</p>
                <p className="mt-2 text-[12px] text-muted-foreground">{k.sub}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
