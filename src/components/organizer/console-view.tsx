'use client'

import { ArrowRight, Calendar, CalendarClock, MapPin, Plus, QrCode, Search } from "lucide-react"
import { StatusTag } from '@/components/ui/status-tag'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Audit #5: the console search bar, ⌘K chip/shortcut and the five FILTER
// pills were all inert. Search now filters the lists below live, pills move
// their active state and scope the sections, and ⌘K opens a command palette
// (nav commands, filtered by typed text — no cmdk dep needed for this size).

type Filter = 'all' | 'runners' | 'waves' | 'merch' | 'activity'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'runners', label: 'Runners' },
  { key: 'waves', label: 'Categories' },
  { key: 'merch', label: 'Merch' },
  // CodeRabbit fix: this pill has always scoped the recent-registrations
  // list + the registration-velocity chart — no transaction/payment data
  // is loaded in the console. Label renamed to match what it filters.
  { key: 'activity', label: 'Activity' },
]

type Section = 'waves' | 'recent' | 'velocity' | 'events' | 'merch'

const SECTIONS_FOR: Record<Filter, Section[]> = {
  all: ['waves', 'recent', 'velocity', 'events'],
  runners: ['recent', 'events'],
  waves: ['waves'],
  merch: ['merch'],
  activity: ['recent', 'velocity'],
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
  // CodeRabbit fix: searchable fields the input promises. bib → BIB search;
  // id → payment reference (registration payments use the registration id
  // as reference_number — components/events/actions.ts).
  bib: string | null
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
  { label: 'Go to overview', href: '/organizer' },
  { label: 'Go to events', href: '/organizer/events' },
  { label: 'Create new event', href: '/organizer/events/new' },
  { label: 'Go to runners', href: '/organizer/runners' },
  { label: 'Go to finance', href: '/organizer/financial' },
  { label: 'Go to analytics', href: '/organizer/analytics' },
  { label: 'Go to merch', href: '/organizer/merch' },
  { label: 'Go to notifications', href: '/organizer/notifications' },
  { label: 'Go to settings', href: '/organizer/settings' },
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
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-popover rounded-xl border border-border shadow-[0_16px_48px_rgba(0,0,0,0.3)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
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
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground text-[11px] font-mono">Esc</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.length > 0 ? filtered.map((c) => (
            <button
              key={c.href}
              onClick={() => go(c.href)}
              className="w-full text-left px-4 h-10 text-[14px] text-foreground hover:bg-accent transition-colors flex items-center justify-between"
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
  const filteredRecent = recent.filter(r =>
    matches(r.runnerName, r.eventName, r.categoryName, r.paymentStatus, r.bib, r.id)
  )
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


  const peak = Math.max(...velocitySeries.map(([, v]) => v), 0)
  const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-[28px] leading-9 font-medium text-foreground">Overview</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">
              {plural(kpis.eventsTotal, 'event')} · {plural(kpis.totalRunners, 'registration')}
            </p>
          </div>

          {activeEvent && (
            <div className="flex min-w-0 items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 lg:min-w-[380px]">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-muted-foreground">Next event</p>
                <Link href={`/organizer/events/${activeEvent.id}`} className="block truncate text-[15px] font-medium text-foreground hover:underline underline-offset-4">
                  {activeEvent.name}
                </Link>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <CalendarClock className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">
                    {activeEvent.daysRemaining > 0 ? `${activeEvent.daysRemaining} days to go` : 'Today'} · {activeEvent.location || 'Location to be announced'}
                  </span>
                </p>
              </div>
              <Link
                href={`/organizer/events/${activeEvent.id}/repc`}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                <QrCode className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Scan kits
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring/40">
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <input
              className="w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              placeholder="Search"
              aria-label="Search bibs, runners, merch and payment references"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {/* Audit #5: the chip was inert — clicking it now opens the same
            palette the real Ctrl/Cmd+K shortcut opens. */}
            <button
              onClick={() => setPaletteOpen(true)}
              title="Open command palette (Ctrl/Cmd+K)"
              className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ⌘K
            </button>
          </div>
          <div className="flex h-10 items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-card p-1" role="tablist" aria-label="Filter sections">
            {FILTERS.map(f => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`h-8 shrink-0 rounded-md px-3 text-[13px] transition-colors ${
                  filter === f.key ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Stat
            label="Confirmed runners"
            value={kpis.confirmedRunners.toLocaleString()}
            sub={kpis.totalRunners > 0 ? `${Math.round((kpis.confirmedRunners / Math.max(kpis.totalRunners, 1)) * 100)}% of ${plural(kpis.totalRunners, 'registration')}` : 'No registrations yet'}
          />
          <Stat
            label="Kits collected"
            value={`${kpis.repcRate}%`}
            sub={`${kpis.checkedIn.toLocaleString()} of ${kpis.totalRunners.toLocaleString()} runners`}
          />
          <Stat
            label="Events"
            value={kpis.eventsTotal.toLocaleString()}
            sub={`${kpis.publishedCount} published · ${plural(kpis.draftCount, 'draft')}`}
          />
        </div>

        {nothingVisible && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center">
            {q !== '' ? (
              <>
                <p className="text-[15px] text-foreground">No results for &ldquo;{q}&rdquo;</p>
                <p className="mt-1 text-[13px] text-muted-foreground">Try a different search or filter</p>
              </>
            ) : (
              <p className="text-[14px] text-muted-foreground">Nothing here for this filter yet</p>
            )}
          </div>
        )}

        {shown('velocity') && velocityDays.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-[16px] font-medium text-foreground">Registrations per day</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {plural(velocityCount, 'registration')} {velocityWindowLabel}
                </p>
              </div>
              <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                {([[30, '30 days'], [14, '14 days'], [1, 'Today']] as const).map(([range, label]) => (
                  <button
                    key={label}
                    onClick={() => setVelocityRange(range)}
                    aria-pressed={velocityRange === range}
                    className={`h-7 rounded-md px-2.5 text-[12px] transition-colors ${velocityRange === range ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 flex h-48 items-end justify-between gap-1.5 border-b border-border">
              {velocitySeries.length > 0 ? velocitySeries.map(([label, count]) => {
                const isPeak = count === peak
                // Audit #13: percentage heights resolve to 0 inside the
                // auto-height flex columns below (bars never mounted), so
                // size bars in px against the fixed plot area.
                const heightPct = Math.round((count / maxVelocity(velocitySeries)) * 100)
                const barHeight = Math.max(Math.round((heightPct / 100) * 160), 4)
                return (
                  <div key={label} className="group flex flex-1 flex-col items-center justify-end" title={`${label}: ${count}`}>
                    {isPeak && <span className="mb-1 font-mono text-[11px] tabular-nums text-foreground">{count}</span>}
                    <div
                      className={`w-full max-w-12 rounded-t-[3px] transition-colors ${isPeak ? 'bg-primary' : 'bg-muted-foreground/25 group-hover:bg-muted-foreground/40'}`}
                      style={{ height: `${barHeight}px` }}
                    />
                  </div>
                )
              }) : (
                <div className="flex h-full flex-1 items-center justify-center text-[13px] text-muted-foreground">
                  No registrations {velocityWindowLabel}
                </div>
              )}
            </div>
            {velocitySeries.length > 0 && (
              <div className="mt-2 flex justify-between gap-1.5">
                {velocitySeries.map(([label]) => (
                  <span key={label} className="flex-1 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{label.slice(-2)}</span>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.6fr_1fr]">
          {shown('recent') && (
            <section className="flex flex-col gap-3">
              <SectionHead title="Recent registrations" href="/organizer/runners" linkLabel="All runners" />
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                {filteredRecent.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {filteredRecent.map((reg) => (
                      <li key={reg.id} className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-medium text-foreground">
                            {(reg.runnerName || 'U').charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[14px] text-foreground">{reg.runnerName || 'Unknown runner'}</p>
                            <p className="truncate text-[12px] text-muted-foreground">
                              {reg.eventName || '—'}{reg.categoryName ? ` · ${reg.categoryName}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="hidden font-mono text-[12px] tabular-nums text-muted-foreground sm:inline">{reg.createdAtLabel}</span>
                          <StatusTag
                            status={reg.paymentStatus}
                            tone={reg.paymentStatus === 'paid' || reg.paymentStatus === 'waived' ? 'success' : reg.paymentStatus === 'pending' ? 'warning' : 'destructive'}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-6 py-12 text-center">
                    <p className="text-[14px] text-foreground">No registrations yet</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">Publish an event to start taking entries</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {shown('waves') && (
            <section className="flex flex-col gap-3">
              <SectionHead title="Category capacity" href={`/organizer/events/${activeEvent?.id}/categories`} linkLabel="Manage" />
              <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                {filteredWaves.map((cat) => {
                  // Real fill from per-wave registration counts (server-side
                  // join on registrations.category_id).
                  const fillPercent = cat.maxSlots
                    ? Math.min(Math.round((cat.regCount / cat.maxSlots) * 100), 100)
                    : 0
                  const remaining = cat.maxSlots ? Math.max(cat.maxSlots - cat.regCount, 0) : null
                  const isAlmostFull = remaining !== null && fillPercent >= 90

                  return (
                    <div key={cat.id} className="px-4 py-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-[14px] text-foreground">{cat.name}</p>
                        <p className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                          {cat.regCount.toLocaleString()} / {cat.maxSlots ? cat.maxSlots.toLocaleString() : '∞'}
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${isAlmostFull ? 'bg-warning' : 'bg-primary'}`}
                          style={{ width: `${cat.maxSlots ? Math.max(fillPercent, 2) : 0}%` }}
                        />
                      </div>
                      <p className={`mt-1.5 text-[12px] ${isAlmostFull ? 'text-warning' : 'text-muted-foreground'}`}>
                        <span className="font-mono">{cat.bibPrefix || 'BIB'}</span> · {remaining !== null ? `${remaining.toLocaleString()} places left` : 'No limit'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        {/* Merch (filter pill target — audit #5) */}
        {shown('merch') && merch.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHead title="Merch" href="/organizer/merch" linkLabel="Open merch" />
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {filteredMerch.map((item) => (
                <li key={item.id} className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-foreground">{item.name}</p>
                    <p className="text-[12px] text-muted-foreground">{item.eventName || '—'} · {item.stock} in stock</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {!item.isActive && <StatusTag tone="neutral">Inactive</StatusTag>}
                    <span className="font-mono text-[13px] tabular-nums text-foreground">
                      RM {item.price.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {shown('events') && (
          <section className="flex flex-col gap-3">
            <SectionHead title="Your events" href="/organizer/events" linkLabel="All events" />
            {filteredEvents.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/organizer/events/${event.id}`}
                    className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium text-foreground">{event.name}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                          <Calendar className="size-3.5 shrink-0" strokeWidth={1.75} />
                          {event.eventDateLabel}
                        </p>
                        {event.location && (
                          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{event.location}</span>
                          </p>
                        )}
                      </div>
                      <StatusTag status={event.status} />
                    </div>
                    <p className="mt-auto border-t border-border pt-3 text-[13px] text-muted-foreground">
                      <span className="tabular-nums text-foreground">{event.paidCount}</span> confirmed of {plural(event.regCount, 'runner')} · {plural(event.catCount, 'category', 'categories')}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center">
                <h3 className="text-[16px] font-medium text-foreground">No events yet</h3>
                <p className="mt-1 max-w-sm text-[14px] text-muted-foreground">
                  Create your first event to start taking registrations
                </p>
                <Link
                  href="/organizer/events/new"
                  className="mt-5 flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Plus className="size-4" strokeWidth={2} />
                  Create event
                </Link>
              </div>
            )}
          </section>
        )}
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-2 text-[32px] leading-none font-medium tabular-nums text-foreground">{value}</p>
      <p className="mt-2 text-[13px] text-muted-foreground">{sub}</p>
    </div>
  )
}

function SectionHead({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-[16px] font-medium text-foreground">{title}</h2>
      <Link href={href} className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
        {linkLabel}
        <ArrowRight className="size-3.5" strokeWidth={1.75} />
      </Link>
    </div>
  )
}

function maxVelocity(days: [string, number][]) {
  return Math.max(...days.map(([, v]) => v), 1)
}
