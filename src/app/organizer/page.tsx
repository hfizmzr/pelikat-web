import { ArrowRight, Badge, Calendar, CalendarClock, CircleCheck, CirclePlus, ExternalLink, Flag, MapPin, Plus, QrCode, Search, SlidersHorizontal, TrendingUp, Users } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Operations Console - Organizer Hub | Pelikat',
  description: 'Real-time event operations command center for race directors',
}

export default async function OrganizerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  // Fetch events with registrations and categories
  const [{ data: events }, { data: recentRegistrations }] = await Promise.all([
    supabase
      .from('events')
      .select(`
        id, name, status, event_date, location,
        race_categories(id, name, max_slots, bib_prefix),
        registrations(id, payment_status, checked_in)
      `)
      .eq('organizer_id', organizerId)
      .order('event_date', { ascending: true })
      .limit(10),
    supabase
      .from('registrations')
      .select(`
        id, payment_status, created_at,
        runner_profiles(full_name),
        events(name),
        race_categories(name)
      `)
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('organizers')
      .select('name')
      .eq('id', organizerId)
      .maybeSingle(),
  ])

  // Aggregate stats
  const allRegs = events?.flatMap(e => e.registrations || []) || []
  const confirmedRunners = allRegs.filter(r => r.payment_status === 'paid').length
  const checkedIn = allRegs.filter(r => r.checked_in).length
  const totalRunners = allRegs.length
  const repcRate = totalRunners > 0 ? Math.round((checkedIn / totalRunners) * 100) : 0

  // Current / upcoming event (first non-past event or latest)
  const now = new Date()
  const activeEvent = events?.find(e => new Date(e.event_date) >= now) || events?.[0]
  const daysRemaining = activeEvent
    ? Math.max(0, Math.ceil((new Date(activeEvent.event_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  // Categories for active event
  const activeCategories = activeEvent?.race_categories || []

  // Registration velocity (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: velocityData } = await supabase
    .from('registrations')
    .select('created_at')
    .eq('organizer_id', organizerId)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true })

  // Group into days for simple bar chart
  const dayMap: Record<string, number> = {}
  velocityData?.forEach(r => {
    const day = new Date(r.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })
    dayMap[day] = (dayMap[day] || 0) + 1
  })
  const velocityDays = Object.entries(dayMap).slice(-14)
  const maxVelocity = Math.max(...velocityDays.map(([, v]) => v), 1)

  const statusColor: Record<string, string> = {
    published: 'text-success bg-success/15',
    draft: 'text-muted-foreground bg-accent',
    closed: 'text-red-300 bg-red-300/15',
    cancelled: 'text-red-300 bg-red-300/15',
  }

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      {/* Ambient blobs */}
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 -right-20 w-[30rem] h-[30rem] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Page heading */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
                Race Director Command
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-border" />
              <span className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                Live Cluster Operational
              </span>
            </div>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">
              Event Operations Console
            </h1>
          </div>

          {/* Active event selector */}
          {activeEvent && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative bg-card rounded-xl px-4 py-2.5 flex items-center gap-4 shadow-md min-w-[300px] border border-muted">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-primary shrink-0">
                  <span className="size-[24px]"><Flag className="size-[24px]" /></span>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] leading-[16px] font-semibold text-foreground truncate">{activeEvent.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[activeEvent.status] || statusColor.draft}`}>
                      {activeEvent.status}
                    </span>
                  </div>
                  <span className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <span className="size-[14px]"><CalendarClock className="size-[14px]" /></span>
                    {daysRemaining > 0 ? `${daysRemaining} Days Remaining` : 'Today!'} • {activeEvent.location || 'TBD'}
                  </span>
                </div>
                <Link href={`/organizer/events/${activeEvent.id}`}>
                  <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                    <span className="size-[20px]"><ExternalLink className="size-[20px]" /></span>
                  </button>
                </Link>
              </div>

              <div className="flex items-center gap-1.5">
                <Link href="/organizer/runners">
                  <button className="p-2.5 bg-card hover:bg-card text-foreground rounded-lg transition-colors flex items-center justify-center shadow-sm border border-muted" title="Runner Directory">
                    <span className="size-[20px]"><Badge className="size-[20px]" /></span>
                  </button>
                </Link>
                <Link href={`/organizer/events/${activeEvent?.id}/repc`}>
                  <button className="px-4 py-2.5 bg-success/20 text-success hover:bg-success/30 text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                    <span className="size-[18px]"><QrCode className="size-[18px]" /></span>
                    <span>Scanner HUD</span>
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Global search bar */}
        <div className="w-full bg-card rounded-xl p-2 border border-muted flex flex-col md:flex-row items-center justify-between gap-2 shadow-md">
          <div className="relative flex-1 w-full flex items-center gap-2">
            <span className="text-muted-foreground size-[20px] pl-2"><Search className="text-muted-foreground size-[20px] pl-2" /></span>
            <input
              className="w-full py-1.5 bg-transparent text-foreground text-[12px] leading-[16px] focus:outline-none placeholder:text-muted-foreground"
              placeholder="Search bibs, runners, SKUs, payment IDs..."
              type="text"
            />
            <div className="flex items-center gap-1 pr-2">
              <kbd className="px-2 py-0.5 rounded bg-accent border border-border/30 text-muted-foreground text-[11px] font-mono font-medium shadow-sm">⌘K</kbd>
            </div>
          </div>
          <div className="h-6 w-px bg-accent hidden md:block" />
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider shrink-0 px-1">Filter:</span>
            <button className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] leading-[14px] tracking-[0.05em] font-semibold shrink-0 transition-colors">All Records</button>
            {['Runners', 'Race Waves', 'Merch SKUs', 'Transactions'].map(f => (
              <button key={f} className="px-2.5 py-1 rounded-lg bg-card text-muted-foreground hover:text-foreground hover:bg-accent text-[10px] leading-[14px] tracking-[0.05em] font-medium shrink-0 transition-colors">{f}</button>
            ))}
          </div>
        </div>

        {/* KPI Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Confirmed Runners */}
          <div className="bg-card rounded-xl p-6 border border-muted flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium">Confirmed Runners</span>
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-primary">
                <span className="size-[20px]"><Users className="size-[20px]" /></span>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{confirmedRunners.toLocaleString()}</div>
              <div className="flex items-center gap-1.5 text-success text-[10px] leading-[14px] font-semibold mt-1">
                <span className="size-[16px]"><TrendingUp className="size-[16px]" /></span>
                <span>{totalRunners > 0 ? `${Math.round((confirmedRunners / Math.max(totalRunners, 1)) * 100)}% paid` : 'No registrations'}</span>
                <span className="text-muted-foreground ml-1">• {totalRunners} total</span>
              </div>
            </div>
          </div>

          {/* REPC Collection Rate */}
          <div className="bg-card rounded-xl p-6 border border-muted flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium">REPC Collection Rate</span>
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-primary">
                <span className="size-[20px]"><QrCode className="size-[20px]" /></span>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{repcRate}%</div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] leading-[14px] font-semibold mt-1">
                <span className="text-primary font-semibold">{checkedIn.toLocaleString()}</span>
                <span>of {totalRunners.toLocaleString()} collected</span>
              </div>
            </div>
          </div>

          {/* Total Events */}
          <div className="bg-card rounded-xl p-6 border border-muted flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium">Total Events</span>
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-success">
                <span className="size-[20px]"><Flag className="size-[20px]" /></span>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{events?.length || 0}</div>
              <div className="flex items-center gap-1.5 text-success text-[10px] leading-[14px] font-semibold mt-1">
                <span className="size-[16px]"><CircleCheck className="size-[16px]" /></span>
                <span>{events?.filter(e => e.status === 'published').length || 0} published</span>
                <span className="text-muted-foreground ml-1">• {events?.filter(e => e.status === 'draft').length || 0} drafts</span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Event Waves */}
        {activeCategories.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Active Event Waves</h2>
                <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Capacity distribution and live quota pacing across registered categories.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/organizer/events/${activeEvent?.id}/categories`}>
                  <button className="px-4 py-2 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-muted">
                    <span className="size-[18px]"><SlidersHorizontal className="size-[18px]" /></span>
                    Category Rules
                  </button>
                </Link>
                <Link href={`/organizer/events/${activeEvent?.id}/categories`}>
                  <button className="px-4 py-2 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-primary transition-all">
                    <span className="size-[18px]"><Plus className="size-[18px]" /></span>
                    Add Wave
                  </button>
                </Link>
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 border border-muted shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {activeCategories.map((cat, i) => {
                  const colors = ['bg-primary', 'bg-primary', 'bg-success', 'bg-muted-foreground']
                  const dotColors = ['bg-primary', 'bg-primary', 'bg-success', 'bg-muted-foreground']
                  const fillPercent = cat.max_slots
                    ? Math.round((0 / cat.max_slots) * 100) // placeholder until we join regs
                    : 0
                  const isAlmostFull = fillPercent >= 90

                  return (
                    <div key={cat.id} className="p-4 rounded-xl bg-card flex flex-col justify-between gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${dotColors[i % dotColors.length]}`} />
                            <span className="text-[12px] leading-[16px] tracking-[0.02em] text-foreground font-semibold">{cat.name}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground mt-0.5 block">
                            {cat.bib_prefix || 'BIB'}-#### • {cat.max_slots || '∞'} slots
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isAlmostFull ? 'bg-red-300/15 text-red-300' : 'bg-primary/15 text-primary'}`}>
                          {fillPercent}%
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5 font-medium">
                          <span>0 of {cat.max_slots || '?'} slots</span>
                          <span className={isAlmostFull ? 'text-red-300' : 'text-muted-foreground'}>
                            {cat.max_slots ? cat.max_slots : '?'} left
                          </span>
                        </div>
                        <div className="w-full bg-accent rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${colors[i % colors.length]}`}
                            style={{ width: `${Math.max(fillPercent, 2)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {activeCategories.length === 0 && (
                  <div className="col-span-4 flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <span className="size-[48px] mb-2"><Flag className="size-[48px] mb-2" /></span>
                    <p className="text-[14px]">No categories yet — add your first race wave</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Recent Registrations */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Recent Registrations</h2>
              <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Latest runner sign-ups across all your events.</p>
            </div>
            <Link href="/organizer/runners">
              <button className="px-4 py-2 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-muted">
                View All
                <span className="size-[18px]"><ArrowRight className="size-[18px]" /></span>
              </button>
            </Link>
          </div>

          <div className="bg-card rounded-xl border border-muted shadow-sm overflow-hidden">
            {recentRegistrations && recentRegistrations.length > 0 ? (
              <div className="divide-y divide-muted">
                {recentRegistrations.map((reg) => (
                  <div key={reg.id} className="flex items-center justify-between px-6 py-3 hover:bg-card transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[12px] font-bold shrink-0">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(((reg as any).runner_profiles as any)?.full_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[14px] leading-[20px] font-medium text-foreground">
                           {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                           {((reg as any).runner_profiles as any)?.full_name || 'Unknown Runner'}
                        </span>
                        <span className="text-[12px] leading-[16px] text-muted-foreground">
                           {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                           {((reg as any).events as any)?.name || '—'}{((reg as any).race_categories as any)?.name ? ` · ${((reg as any).race_categories as any)?.name}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(reg.created_at).toLocaleDateString('en-MY')}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        reg.payment_status === 'paid'
                          ? 'bg-success/15 text-success'
                          : reg.payment_status === 'pending'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-red-300/15 text-red-300'
                      }`}>
                        {reg.payment_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <span className="size-[48px] mb-2"><Badge className="size-[48px] mb-2" /></span>
                <p className="text-[14px]">No registrations yet</p>
                <p className="text-[12px] mt-1">Create and publish an event to start accepting runners</p>
              </div>
            )}
          </div>
        </section>

        {/* Registration Velocity Chart */}
        {velocityDays.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Registration Velocity</h2>
                <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Daily sign-up trends over the last 14 days.</p>
              </div>
              <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-muted">
                {['30 Days', '14 Days', 'Today'].map((t, i) => (
                  <button key={t} className={`px-2 py-1 text-[10px] leading-[14px] rounded font-medium transition-colors ${i === 0 ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 border border-muted shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-foreground">Daily Signups</span>
                  <span className="text-[12px] leading-[16px] text-muted-foreground">
                    {velocityData?.length || 0} registrations in the last 30 days
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <span className="text-[10px] leading-[14px] text-muted-foreground">Regular</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-success ml-2" />
                  <span className="text-[10px] leading-[14px] text-muted-foreground">Peak</span>
                </div>
              </div>
              <div className="w-full h-44 flex items-end justify-between gap-1 pt-6 px-1">
                {velocityDays.map(([label, count]) => {
                  const isPeak = count === Math.max(...velocityDays.map(([, v]) => v))
                  const heightPct = Math.round((count / maxVelocity) * 100)
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1 group">
                      <div
                        className={`w-full rounded-t transition-all ${isPeak ? 'bg-success group-hover:bg-success' : 'bg-primary/25 group-hover:bg-primary'}`}
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                      <span className={`text-[9px] ${isPeak ? 'text-success font-semibold' : 'text-muted-foreground'}`}>
                        {label.split(' ')[0]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Events list */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Your Events</h2>
              <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">All events managed by your organization.</p>
            </div>
            <Link href="/organizer/events/new">
              <button className="px-4 py-2 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-primary transition-all ">
                <span className="size-[16px]"><CirclePlus className="size-[16px]" /></span>
                Create Event
              </button>
            </Link>
          </div>

          {events && events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((event) => {
                const regs = event.registrations || []
                const paid = regs.filter((r: { payment_status: string }) => r.payment_status === 'paid').length
                const catCount = (event.race_categories || []).length

                return (
                  <Link key={event.id} href={`/organizer/events/${event.id}`} className="block group">
                    <div className="bg-card rounded-xl border border-muted overflow-hidden hover:border-primary/30 transition-all ">
                      <div className="h-1.5 bg-gradient-to-r from-primary to-primary" />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-[16px] leading-[24px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{event.name}</span>
                            <span className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1">
                              <span className="size-[14px]"><Calendar className="size-[14px]" /></span>
                              {new Date(event.event_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <span className={`shrink-0 text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold ${statusColor[event.status] || statusColor.draft}`}>
                            {event.status}
                          </span>
                        </div>
                        {event.location && (
                          <p className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1 mb-3">
                            <span className="size-[14px]"><MapPin className="size-[14px]" /></span>
                            {event.location}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[12px] leading-[16px]">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <span className="size-[16px]"><Badge className="size-[16px]" /></span>
                              {regs.length} runners
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <span className="size-[16px]"><Flag className="size-[16px]" /></span>
                              {catCount} categories
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground">
                            {paid} paid
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-muted p-12 flex flex-col items-center justify-center text-center">
              <span className="size-[64px] text-border mb-4"><Flag className="size-[64px] text-border mb-4" /></span>
              <h3 className="text-[18px] leading-[24px] font-semibold text-foreground mb-2">No events yet</h3>
              <p className="text-[14px] leading-[20px] text-muted-foreground mb-6 max-w-sm">
                Create your first running event to start accepting registrations and managing participants.
              </p>
              <Link href="/organizer/events/new">
                <button className="px-6 py-2.5 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all">
                  <span className="size-[18px]"><CirclePlus className="size-[18px]" /></span>
                  Create your first event
                </button>
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-muted py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-muted-foreground text-[12px] leading-[16px]">
          <div>Pelikat Batik Running Platform © {new Date().getFullYear()}. Enterprise Event Operations.</div>
          <div className="flex items-center gap-6">
            {['Organizer Helpdesk', 'API & Webhooks', 'Event Terms', 'Support'].map(l => (
              <span key={l} className="hover:text-foreground transition-colors cursor-pointer">{l}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}