'use client'

import { ArrowRight, Badge, Calendar, CalendarClock, CircleCheck, CirclePlus, ExternalLink, Flag, MapPin, Plus, QrCode, Search, SlidersHorizontal, TrendingUp, Users } from "lucide-react"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Audit #5: the console search bar, ⌘K chip/shortcut and the five FILTER
// pills were all inert. Search now filters the lists below live, pills move
// their active state and scope the sections, and ⌘K opens a command palette
// (nav commands, filtered by typed text — no cmdk dep needed for this size).

type Filter = 'all' | 'runners' | 'waves' | 'merch' | 'transactions'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All Records' },
  { key: 'runners', label: 'Runners' },
  { key: 'waves', label: 'Race Waves' },
  { key: 'merch', label: 'Merch SKUs' },
  { key: 'transactions', label: 'Transactions' },
]

type Section = 'waves' | 'recent' | 'velocity' | 'events' | 'merch'

const SECTIONS_FOR: Record<Filter, Section[]> = {
  all: ['waves', 'recent', 'velocity', 'events'],
  runners: ['recent', 'events'],
  waves: ['waves'],
  merch: ['merch'],
  transactions: ['recent', 'velocity'],
}

export interface ConsoleActiveEvent {
  id: string
  name: string
  status: string
  location: string | null
  daysRemaining: number
}
export interface ConsoleWave {
  id: string
  name: string
  bibPrefix: string | null
  maxSlots: number | null
  regCount: number
}
export interface ConsoleRecent {
  id: string
  paymentStatus: string
  createdAtLabel: string
  runnerName: string | null
  eventName: string | null
  categoryName: string | null
}
export interface ConsoleEventCard {
  id: string
  name: string
  status: string
  location: string | null
  eventDateLabel: string
  regCount: number
  paidCount: number
  catCount: number
}
export interface ConsoleMerchItem {
  id: string
  name: string
  price: number
  isActive: boolean
  eventName: string | null
  stock: number
}

const COMMANDS = [
  { label: 'Go to Dashboard', href: '/organizer' },
  { label: 'Go to Events', href: '/organizer/events' },
  { label: 'Create New Event', href: '/organizer/events/new' },
  { label: 'Go to Runner Directory', href: '/organizer/runners' },
  { label: 'Go to Financial Rails', href: '/organizer/financial' },
  { label: 'Go to Analytics', href: '/organizer/analytics' },
  { label: 'Go to Merch Hub', href: '/organizer/merch' },
  { label: 'Go to Notifications', href: '/organizer/notifications' },
  { label: 'Go to Settings', href: '/organizer/settings' },
]

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(q.trim().toLowerCase()))

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-card rounded-xl border border-muted shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-muted">
          <Search className="text-muted-foreground size-[18px] shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter' && filtered[0]) go(filtered[0].href)
            }}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-foreground text-[14px] focus:outline-none placeholder:text-muted-foreground"
          />
          <kbd className="px-2 py-0.5 rounded bg-accent border border-border/30 text-muted-foreground text-[11px] font-mono">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length > 0 ? filtered.map((c) => (
            <button
              key={c.href}
              onClick={() => go(c.href)}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-accent transition-colors flex items-center justify-between"
            >
              <span>{c.label}</span>
              <ArrowRight className="size-[14px] text-muted-foreground" />
            </button>
          )) : (
            <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function OrganizerConsole({
  activeEvent,
  waves,
  recent,
  velocityDays,
  events,
  merch,
  kpis,
}: {
  activeEvent: ConsoleActiveEvent | null
  waves: ConsoleWave[]
  recent: ConsoleRecent[]
  velocityDays: [string, number][]
  events: ConsoleEventCard[]
  merch: ConsoleMerchItem[]
  kpis: {
    confirmedRunners: number
    totalRunners: number
    repcRate: number
    checkedIn: number
    eventsTotal: number
    publishedCount: number
    draftCount: number
  }
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Audit: the 30/14/today segmented control was inert (active index
  // hardcoded). Local state + derived series — the full 30-day buckets are
  // already client-side, no extra fetching.
  const [velocityRange, setVelocityRange] = useState<30 | 14 | 1>(30)

  // Real Ctrl/Cmd+K for the ⌘K chip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Live search across the list-like content the pills scope. Velocity is an
  // aggregate (not searchable) so it hides while a query is active.
  const q = query.trim().toLowerCase()
  const matches = (...vals: (string | null | undefined)[]) =>
    q === '' || vals.some(v => (v ?? '').toLowerCase().includes(q))

  const filteredWaves = waves.filter(w => matches(w.name))
  const filteredRecent = recent.filter(r => matches(r.runnerName, r.eventName, r.categoryName, r.paymentStatus))
  const filteredEvents = events.filter(e => matches(e.name, e.location, e.status))
  const filteredMerch = merch.filter(m => matches(m.name, m.eventName))

  // Velocity window: bucket keys are ISO dates (ascending) from the server.
  // For 30 days the full series is used verbatim (initial render path — no
  // Date work, so server/client markup stays identical); 14-day and today
  // cutoffs are only computed after a click, so client-local "today" can't
  // diverge from the server-rendered output.
  const velocitySeries = velocityRange === 30
    ? velocityDays
    : velocityDays.filter(([day]) => {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - (velocityRange - 1))
        return day >= cutoff.toLocaleDateString('en-CA')
      })
  const velocityCount = velocitySeries.reduce((a, [, v]) => a + v, 0)
  const velocityWindowLabel = velocityRange === 30
    ? 'in the last 30 days'
    : velocityRange === 14
    ? 'in the last 14 days'
    : 'today'

  const sectionHidden = (s: Section): boolean => {
    switch (s) {
      case 'waves':
        return waves.length === 0 || (q !== '' && filteredWaves.length === 0)
      case 'recent':
        return q !== '' && filteredRecent.length === 0
      case 'events':
        return q !== '' && filteredEvents.length === 0
      case 'merch':
        return merch.length === 0 || (q !== '' && filteredMerch.length === 0)
      case 'velocity':
        return velocityDays.length === 0 || q !== ''
    }
  }
  const shown = (s: Section) => SECTIONS_FOR[filter].includes(s) && !sectionHidden(s)
  const nothingVisible = SECTIONS_FOR[filter].every(sectionHidden)

  const statusColor: Record<string, string> = {
    published: 'text-success bg-success/15',
    draft: 'text-muted-foreground bg-accent',
    closed: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/15',
    cancelled: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/15',
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
                  <Flag className="size-[24px]" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] leading-[16px] font-semibold text-foreground truncate">{activeEvent.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[activeEvent.status] || statusColor.draft}`}>
                      {activeEvent.status}
                    </span>
                  </div>
                  <span className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <CalendarClock className="size-[14px]" />
                    {activeEvent.daysRemaining > 0 ? `${activeEvent.daysRemaining} Days Remaining` : 'Today!'} • {activeEvent.location || 'TBD'}
                  </span>
                </div>
                <Link href={`/organizer/events/${activeEvent.id}`}>
                  <button className="text-muted-foreground hover:text-foreground transition-colors p-1">
                    <ExternalLink className="size-[20px]" />
                  </button>
                </Link>
              </div>

              <div className="flex items-center gap-1.5">
                <Link href="/organizer/runners">
                  <button className="p-2.5 bg-card hover:bg-card text-foreground rounded-lg transition-colors flex items-center justify-center shadow-sm border border-muted" title="Runner Directory">
                    <Badge className="size-[20px]" />
                  </button>
                </Link>
                <Link href={`/organizer/events/${activeEvent.id}/repc`}>
                  <button className="px-4 py-2.5 bg-success/20 text-success hover:bg-success/30 text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                    <QrCode className="size-[18px]" />
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
            <Search className="text-muted-foreground size-[20px] pl-2 shrink-0" />
            <input
              className="w-full py-1.5 bg-transparent text-foreground text-[12px] leading-[16px] focus:outline-none placeholder:text-muted-foreground"
              placeholder="Search bibs, runners, SKUs, payment IDs..."
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-1 pr-2">
              {/* Audit #5: the chip was inert — clicking it now opens the same
              palette the real Ctrl/Cmd+K shortcut opens. */}
              <button
                onClick={() => setPaletteOpen(true)}
                title="Open command palette (Ctrl/Cmd+K)"
                className="px-2 py-0.5 rounded bg-accent border border-border/30 text-muted-foreground text-[11px] font-mono font-medium shadow-sm hover:text-foreground transition-colors"
              >
                ⌘K
              </button>
            </div>
          </div>
          <div className="h-6 w-px bg-accent hidden md:block" />
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider shrink-0 px-1">Filter:</span>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 rounded-lg text-[10px] leading-[14px] tracking-[0.05em] font-semibold shrink-0 transition-colors ${
                  filter === f.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {f.label}
              </button>
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
                <Users className="size-[20px]" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{kpis.confirmedRunners.toLocaleString()}</div>
              <div className="flex items-center gap-1.5 text-success text-[10px] leading-[14px] font-semibold mt-1">
                <TrendingUp className="size-[16px]" />
                <span>{kpis.totalRunners > 0 ? `${Math.round((kpis.confirmedRunners / Math.max(kpis.totalRunners, 1)) * 100)}% confirmed` : 'No registrations'}</span>
                <span className="text-muted-foreground ml-1">• {kpis.totalRunners} total</span>
              </div>
            </div>
          </div>

          {/* REPC Collection Rate */}
          <div className="bg-card rounded-xl p-6 border border-muted flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium">REPC Collection Rate</span>
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-primary">
                <QrCode className="size-[20px]" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{kpis.repcRate}%</div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] leading-[14px] font-semibold mt-1">
                <span className="text-primary font-semibold">{kpis.checkedIn.toLocaleString()}</span>
                <span>of {kpis.totalRunners.toLocaleString()} collected</span>
              </div>
            </div>
          </div>

          {/* Total Events */}
          <div className="bg-card rounded-xl p-6 border border-muted flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium">Total Events</span>
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-success">
                <Flag className="size-[20px]" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{kpis.eventsTotal}</div>
              <div className="flex items-center gap-1.5 text-success text-[10px] leading-[14px] font-semibold mt-1">
                <CircleCheck className="size-[16px]" />
                <span>{kpis.publishedCount} published</span>
                <span className="text-muted-foreground ml-1">• {kpis.draftCount} drafts</span>
              </div>
            </div>
          </div>
        </div>

        {nothingVisible && (
          <div className="bg-card rounded-xl border border-muted p-12 flex flex-col items-center justify-center text-center text-muted-foreground">
            <Search className="size-[48px] text-border mb-3" />
            {q !== '' ? (
              <>
                <p className="text-[14px]">No results for &ldquo;{q}&rdquo;</p>
                <p className="text-[12px] mt-1">Try a different search term or filter</p>
              </>
            ) : (
              <p className="text-[14px]">Nothing here for this filter yet</p>
            )}
          </div>
        )}

        {/* Active Event Waves */}
        {shown('waves') && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Active Event Waves</h2>
                <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Capacity distribution and live quota pacing across registered categories.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/organizer/events/${activeEvent?.id}/categories`}>
                  <button className="px-4 py-2 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-muted">
                    <SlidersHorizontal className="size-[18px]" />
                    Category Rules
                  </button>
                </Link>
                <Link href={`/organizer/events/${activeEvent?.id}/categories`}>
                  <button className="px-4 py-2 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-primary transition-all">
                    <Plus className="size-[18px]" />
                    Add Wave
                  </button>
                </Link>
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 border border-muted shadow-sm">
              {/* Audit #12: with only 2 wave cards the old 4-col desktop track
              left a dead zone; sm:grid-cols-2 cap balances the cards. The
              audit's `xl:grid-cols-3` (1280px) would re-create the same dead
              zone at the audited 1440 viewport, so it is dropped. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {filteredWaves.map((cat, i) => {
                  const dotColors = ['bg-primary', 'bg-primary', 'bg-success', 'bg-muted-foreground']
                  // Real fill from per-wave registration counts (server-side
                  // join on registrations.category_id).
                  const fillPercent = cat.maxSlots
                    ? Math.min(Math.round((cat.regCount / cat.maxSlots) * 100), 100)
                    : 0
                  const remaining = cat.maxSlots ? Math.max(cat.maxSlots - cat.regCount, 0) : null
                  const isAlmostFull = remaining !== null && fillPercent >= 90

                  return (
                    <div key={cat.id} className="p-4 rounded-xl bg-card flex flex-col justify-between gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${dotColors[i % dotColors.length]}`} />
                            <span className="text-[12px] leading-[16px] tracking-[0.02em] text-foreground font-semibold">{cat.name}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground mt-0.5 block">
                            {cat.bibPrefix || 'BIB'}-#### • {cat.maxSlots || '∞'} slots
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isAlmostFull ? 'bg-red-500/10 dark:bg-red-300/15 text-red-500 dark:text-red-300' : 'bg-primary/15 text-primary'}`}>
                          {cat.maxSlots ? `${fillPercent}%` : `${cat.regCount} / ∞`}
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5 font-medium">
                          <span>{cat.regCount} of {cat.maxSlots || '∞'} slots</span>
                          <span className={isAlmostFull ? 'text-red-500 dark:text-red-300' : 'text-muted-foreground'}>
                            {remaining !== null ? `${remaining} left` : '∞ left'}
                          </span>
                        </div>
                        <div className="w-full bg-accent rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${cat.maxSlots ? Math.max(fillPercent, 2) : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Recent Registrations */}
        {shown('recent') && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Recent Registrations</h2>
                <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Latest runner sign-ups across all your events.</p>
              </div>
              <Link href="/organizer/runners">
                <button className="px-4 py-2 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-muted">
                  View All
                  <ArrowRight className="size-[18px]" />
                </button>
              </Link>
            </div>

            <div className="bg-card rounded-xl border border-muted shadow-sm overflow-hidden">
              {filteredRecent.length > 0 ? (
                <div className="divide-y divide-muted">
                  {filteredRecent.map((reg) => (
                    <div key={reg.id} className="flex items-center justify-between px-6 py-3 hover:bg-card transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[12px] font-bold shrink-0">
                          {(reg.runnerName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[14px] leading-[20px] font-medium text-foreground">
                            {reg.runnerName || 'Unknown Runner'}
                          </span>
                          <span className="text-[12px] leading-[16px] text-muted-foreground">
                            {reg.eventName || '—'}{reg.categoryName ? ` · ${reg.categoryName}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">
                          {reg.createdAtLabel}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          reg.paymentStatus === 'paid' || reg.paymentStatus === 'waived'
                            ? 'bg-success/15 text-success'
                            : reg.paymentStatus === 'pending'
                            ? 'bg-primary/15 text-primary'
                            : 'bg-red-500/10 dark:bg-red-300/15 text-red-500 dark:text-red-300'
                        }`}>
                          {reg.paymentStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Badge className="size-[48px] mb-2" />
                  <p className="text-[14px]">No registrations yet</p>
                  <p className="text-[12px] mt-1">Create and publish an event to start accepting runners</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Registration Velocity Chart */}
        {shown('velocity') && velocityDays.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Registration Velocity</h2>
                <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Daily sign-up trends for the selected window.</p>
              </div>
              <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-muted">
                {([[30, '30 Days'], [14, '14 Days'], [1, 'Today']] as const).map(([range, label]) => (
                  <button
                    key={label}
                    onClick={() => setVelocityRange(range)}
                    className={`px-2 py-1 text-[10px] leading-[14px] rounded font-medium transition-colors ${velocityRange === range ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 border border-muted shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-foreground">Daily Signups</span>
                  <span className="text-[12px] leading-[16px] text-muted-foreground">
                    {velocityCount} registrations {velocityWindowLabel}
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
                {velocitySeries.length > 0 ? velocitySeries.map(([label, count]) => {
                  const isPeak = count === Math.max(...velocitySeries.map(([, v]) => v))
                  // Audit #13: percentage heights resolve to 0 inside the
                  // auto-height flex columns below (bars never mounted), so
                  // size bars in px against the fixed h-44 plot area
                  // (~120px usable above the label row).
                  const heightPct = Math.round((count / maxVelocity(velocitySeries)) * 100)
                  const barHeight = Math.max(Math.round((heightPct / 100) * 120), 5)
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1 group">
                      <div
                        className={`w-full rounded-t transition-all ${isPeak ? 'bg-success group-hover:bg-success' : 'bg-primary/25 group-hover:bg-primary'}`}
                        style={{ height: `${barHeight}px` }}
                      />
                      <span className={`text-[9px] ${isPeak ? 'text-success font-semibold' : 'text-muted-foreground'}`}>
                        {label.slice(-2)}
                      </span>
                    </div>
                  )
                }) : (
                  <div className="flex-1 h-full flex items-center justify-center text-[12px] text-muted-foreground">
                    No registrations {velocityWindowLabel}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Merch SKUs (filter pill target — audit #5) */}
        {shown('merch') && merch.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Merch SKUs</h2>
                <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">Latest merchandise SKUs across your events.</p>
              </div>
              <Link href="/organizer/merch">
                <button className="px-4 py-2 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-muted">
                  Merch Hub
                  <ArrowRight className="size-[18px]" />
                </button>
              </Link>
            </div>

            <div className="bg-card rounded-xl border border-muted shadow-sm overflow-hidden">
              <div className="divide-y divide-muted">
                {filteredMerch.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-6 py-3 hover:bg-card transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0">
                        <Plus className="size-[16px]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[14px] leading-[20px] font-medium text-foreground truncate">{item.name}</span>
                        <span className="text-[12px] leading-[16px] text-muted-foreground">{item.eventName || '—'} · {item.stock} in stock</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!item.isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent text-muted-foreground">inactive</span>
                      )}
                      <span className="text-[13px] font-semibold text-foreground">
                        RM {item.price.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Events list */}
        {shown('events') && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Your Events</h2>
                <p className="text-[12px] leading-[16px] text-muted-foreground mt-0.5">All events managed by your organization.</p>
              </div>
              <Link href="/organizer/events/new">
                <button className="px-4 py-2 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-primary transition-all ">
                  <CirclePlus className="size-[16px]" />
                  Create Event
                </button>
              </Link>
            </div>

            {filteredEvents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEvents.map((event) => (
                  <Link key={event.id} href={`/organizer/events/${event.id}`} className="block group">
                    <div className="bg-card rounded-xl border border-muted overflow-hidden hover:border-primary/30 transition-all ">
                      <div className="h-1.5 bg-gradient-to-r from-primary to-primary" />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-[16px] leading-[24px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{event.name}</span>
                            <span className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="size-[14px]" />
                              {event.eventDateLabel}
                            </span>
                          </div>
                          <span className={`shrink-0 text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold ${statusColor[event.status] || statusColor.draft}`}>
                            {event.status}
                          </span>
                        </div>
                        {event.location && (
                          <p className="text-[12px] leading-[16px] text-muted-foreground flex items-center gap-1 mb-3">
                            <MapPin className="size-[14px]" />
                            {event.location}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[12px] leading-[16px]">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Badge className="size-[16px]" />
                              {event.regCount} runners
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Flag className="size-[16px]" />
                              {event.catCount} categories
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground">
                            {event.paidCount} confirmed
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-muted p-12 flex flex-col items-center justify-center text-center">
                <Flag className="size-[64px] text-border mb-4" />
                <h3 className="text-[18px] leading-[24px] font-semibold text-foreground mb-2">No events yet</h3>
                <p className="text-[14px] leading-[20px] text-muted-foreground mb-6 max-w-sm">
                  Create your first running event to start accepting registrations and managing participants.
                </p>
                <Link href="/organizer/events/new">
                  <button className="px-6 py-2.5 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all">
                    <CirclePlus className="size-[18px]" />
                    Create your first event
                  </button>
                </Link>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-muted py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-muted-foreground text-[12px] leading-[16px]">
          <div>Pelikat Batik Running Platform © {new Date().getFullYear()}. Professional Event Operations.</div>
        </div>
      </footer>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}

function maxVelocity(days: [string, number][]) {
  return Math.max(...days.map(([, v]) => v), 1)
}
