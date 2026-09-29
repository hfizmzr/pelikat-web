import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'

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
  const confirmedRunners = allRegs.filter((r) => r.payment_status === 'paid').length

  // Find the next upcoming event
  const nextEvent = upcomingEvents[0]
  const nextEventCats = (nextEvent?.race_categories || []) as Array<{id: string, name: string, max_slots: number}>
  const nextEventRegs = (nextEvent?.registrations || []) as Array<{payment_status: string, checked_in: boolean}>

  return {
    orgName: org?.name || 'My Org',
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

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string
  label: string
  value: string | number
  sub?: string
  color: 'primary' | 'secondary' | 'tertiary' | 'error'
}) {
  const colorMap = {
    primary: {
      bg: 'bg-[#d0bcff]/10',
      text: 'text-[#d0bcff]',
      bar: 'bg-[#d0bcff]',
    },
    secondary: {
      bg: 'bg-[#4cd7f6]/10',
      text: 'text-[#4cd7f6]',
      bar: 'bg-[#4cd7f6]',
    },
    tertiary: {
      bg: 'bg-[#4edea3]/10',
      text: 'text-[#4edea3]',
      bar: 'bg-[#4edea3]',
    },
    error: { bg: 'bg-[#ffb4ab]/10', text: 'text-[#ffb4ab]', bar: 'bg-[#ffb4ab]' },
  }
  const c = colorMap[color]

  return (
    <div className="flex flex-col justify-between p-4 rounded-xl bg-[#1c1b1d] shadow-sm border border-[#353437]/40">
      <div className="flex items-center justify-between">
        <span className={`p-1.5 rounded-lg ${c.bg} ${c.text}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
      <div className="mt-4">
        <span className="block text-[10px] leading-[14px] tracking-[0.05em] text-[#cbc3d7] font-medium uppercase">
          {label}
        </span>
        <p className="text-[24px] leading-[28px] tracking-[-0.01em] font-bold text-[#e5e1e4] mt-0.5">
          {value}
        </p>
        {sub && (
          <span className="block text-[11px] text-[#958ea0] mt-1">{sub}</span>
        )}
      </div>
    </div>
  )
}

export default async function OrganizerMobileHome() {
  const data = await getOrganizerDashboardData()

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[#958ea0]">
        <div className="text-center">
          <span className="material-symbols-outlined text-[48px] mb-3 block">lock</span>
          <p className="text-[14px]">Session expired. Please log in.</p>
        </div>
      </div>
    )
  }

  const checkInPercent = data.checkInRate
  const isLive = data.nextEvent?.status === 'active'

  return (
    <div className="flex flex-col w-full min-h-screen bg-[#131315]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl px-5 pt-safe">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-bold text-[#e5e1e4]">
                  PELIKAT
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-[#d0bcff]/10 text-[#d0bcff] text-[10px] leading-[14px] font-semibold tracking-wider uppercase">
                  HUB
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse shrink-0" />
                <span className="text-[10px] leading-[14px] text-[#958ea0]">
                  {data.orgName}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] hover:text-[#e5e1e4] transition-colors">
              <span className="material-symbols-outlined text-[22px]">notifications</span>
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#4cd7f6] ring-2 ring-[#131315]" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-col px-5 space-y-5">

        {/* Next / Active Event Banner */}
        {data.nextEvent && (
          <section className="flex flex-col gap-2 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#d0bcff]/20 text-[#d0bcff]">
                  <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    terminal
                  </span>
                </span>
                <span className="text-[10px] leading-[14px] tracking-wider uppercase text-[#cbc3d7] font-bold">
                  Race Director Command
                </span>
              </div>
              {isLive && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4edea3]/10 text-[#4edea3]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-ping" />
                  <span className="text-[10px] leading-[14px] font-bold tracking-wider uppercase">
                    LIVE
                  </span>
                </div>
              )}
            </div>

            <div className="relative overflow-hidden rounded-xl bg-[#201f22] p-4 shadow-md border border-[#353437]/40">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-[#d0bcff]/10 blur-2xl pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-1">
                <span className="text-[10px] leading-[14px] uppercase tracking-wider text-[#4cd7f6] font-semibold">
                  {isLive ? 'Active Production Pipeline' : 'Next Upcoming Event'}
                </span>
                <h1 className="text-[22px] leading-[28px] tracking-[-0.015em] text-[#e5e1e4] font-extrabold">
                  {data.nextEvent.name}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#cbc3d7] mt-1 text-[11px]">
                  {data.nextEvent.location && (
                    <span className="inline-flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px] text-[#d0bcff]">location_on</span>
                      {data.nextEvent.location}
                    </span>
                  )}
                  <span className="w-1 h-1 rounded-full bg-[#353437]" />
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px] text-[#4edea3]">group</span>
                    {data.nextEvent.registered} Registered
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Quick Actions */}
        <section>
          <h2 className="text-[16px] leading-[24px] font-bold text-[#e5e1e4] tracking-tight mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/organizer/mobile/scanner', icon: 'qr_code_scanner', label: 'BIB Scanner', color: 'text-[#d0bcff]', bg: 'bg-[#d0bcff]/10' },
              { href: '/organizer/mobile/events', icon: 'calendar_today', label: 'My Events', color: 'text-[#4cd7f6]', bg: 'bg-[#4cd7f6]/10' },
              { href: '/organizer/mobile/console', icon: 'speed', label: 'Race Console', color: 'text-[#4edea3]', bg: 'bg-[#4edea3]/10' },
              { href: '/organizer/mobile/merch', icon: 'shopping_bag', label: 'Kit Inventory', color: 'text-[#a078ff]', bg: 'bg-[#a078ff]/10' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center p-4 rounded-xl bg-[#1c1b1d] border border-[#353437]/40 gap-2 active:scale-95 transition-transform shadow-sm"
              >
                <span className={`p-2.5 rounded-xl ${item.bg} ${item.color}`}>
                  <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
                </span>
                <span className="text-[12px] leading-[16px] font-semibold text-[#e5e1e4] text-center">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* KPI Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] leading-[24px] font-bold text-[#e5e1e4] tracking-tight">
              Critical Ops Status
            </h2>
            <span className="text-[10px] leading-[14px] text-[#958ea0] uppercase tracking-wider">
              Sync: Live
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon="how_to_reg"
              label="Check-in Velocity"
              value={`${data.checkedIn}`}
              sub={`${checkInPercent}% rate`}
              color="primary"
            />
            <StatCard
              icon="group"
              label="Total Registered"
              value={data.totalRunners}
              sub={`${data.confirmedRunners} confirmed`}
              color="secondary"
            />
            <StatCard
              icon="event_available"
              label="Upcoming Events"
              value={data.upcomingCount}
              sub="Active pipeline"
              color="tertiary"
            />
            <StatCard
              icon="verified_user"
              label="Safety Status"
              value="Green"
              sub="All systems go"
              color="tertiary"
            />
          </div>
        </section>

        {/* Check-in progress */}
        {data.nextEvent && (
          <section className="pb-4">
            <div className="rounded-xl bg-[#1c1b1d] p-4 border border-[#353437]/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] leading-[16px] font-semibold text-[#cbc3d7]">
                  Check-in Progress
                </span>
                <span className="text-[10px] text-[#4cd7f6] font-bold">{checkInPercent}%</span>
              </div>
              <div className="w-full bg-[#353437] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#d0bcff] h-full rounded-full transition-all duration-700"
                  style={{ width: `${checkInPercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[11px] text-[#958ea0]">
                  {data.checkedIn} checked in
                </span>
                <span className="text-[11px] text-[#958ea0]">
                  {data.nextEvent.registered} total
                </span>
              </div>
              <Link
                href={`/organizer/mobile/scanner`}
                className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                Open Full Scanner
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
