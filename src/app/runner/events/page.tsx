import { Search, X, ChevronRight } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { StatusTag } from '@/components/ui/status-tag'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Explore events - Pelikat',
  description: 'Discover and register for upcoming running events',
}

export default async function RunnerEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; search?: string }>
}) {
  const { period = 'upcoming', search = '' } = await searchParams
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: myRegistrations } = await supabase
    .from('registrations')
    .select('*, events(name, event_date, location, status), race_categories(name)')
    .eq('runner_id', profile?.id)
    .order('created_at', { ascending: false })

  const registeredEventIds = myRegistrations?.map(r => r.event_id) || []

  let eventsQuery = supabase
    .from('events')
    .select('*, organizers(name), race_categories(count)')
    .eq('status', 'published')
    .order('event_date', { ascending: true })

  if (period === 'upcoming') {
    eventsQuery = eventsQuery.gte('event_date', now)
  } else if (period === 'past') {
    eventsQuery = eventsQuery.lt('event_date', now)
  }

  if (search) {
    eventsQuery = eventsQuery.or(
      `name.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`
    )
  }

  const { data: events } = await eventsQuery

  const tabs = [
    { label: 'Upcoming', value: 'upcoming' },
    { label: 'Past', value: 'past' },
    { label: 'All', value: 'all' },
  ]

  const unjoinedEvents = events?.filter(e => !registeredEventIds.includes(e.id)) || []
  const joinedEvents = events?.filter(e => registeredEventIds.includes(e.id)) || []

  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d).toLocaleDateString('en-MY', opts)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 px-5 pb-4 pt-safe backdrop-blur-md">
        <div className="flex h-14 items-center">
          <h1 className="text-[20px] font-medium text-foreground">Explore events</h1>
        </div>

        <form action="/runner/events" method="GET" className="relative">
          <input type="hidden" name="period" value={period} />
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search"
            aria-label="Search events and locations"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-9 pr-10 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {search && (
            <Link
              href={`/runner/events?period=${period}`}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Link>
          )}
        </form>

        <div className="mt-3 flex h-10 items-center gap-0.5 rounded-[10px] border border-border/60 bg-card p-1" aria-label="When">
          {tabs.map(tab => {
            const active = period === tab.value
            return (
              <Link
                key={tab.value}
                aria-current={active ? 'page' : undefined}
                href={`/runner/events?period=${tab.value}${search ? `&search=${search}` : ''}`}
                className={`flex h-8 flex-1 items-center justify-center rounded-md text-[13px] transition-colors ${
                  active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </header>

      <div className="flex flex-col gap-8 px-5 py-6">
        {joinedEvents.length > 0 && !search && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-medium text-foreground">Your registered events</h2>
            <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 scrollbar-none">
              {joinedEvents.map(event => {
                const reg = myRegistrations?.find(r => r.event_id === event.id)
                return (
                  <Link
                    key={event.id}
                    href={`/runner/events/${event.id}`}
                    className="flex w-[240px] shrink-0 snap-start flex-col rounded-xl border border-border/60 bg-card p-4 transition-transform active:scale-[0.98]"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] text-muted-foreground">
                        {fmt(event.event_date, { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <StatusTag status={reg?.payment_status} />
                    </div>
                    <h3 className="mb-3 line-clamp-2 text-[15px] leading-tight font-medium text-foreground">
                      {event.name}
                    </h3>
                    <p className="mt-auto truncate text-[12px] text-muted-foreground">
                      {reg?.race_categories?.name}
                      {event.event_type !== 'virtual' && reg?.bib_number && (
                        <> · <span className="font-mono text-foreground">{reg.bib_number}</span></>
                      )}
                    </p>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-medium text-foreground">
            {search ? 'Search results' : 'Discover events'}
          </h2>

          {unjoinedEvents.length > 0 ? (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
              {unjoinedEvents.map(event => (
                <li key={event.id}>
                  <Link
                    href={`/runner/events/${event.id}`}
                    className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-border/60 py-1.5 text-center">
                      <span className="text-[11px] text-muted-foreground">{fmt(event.event_date, { month: 'short' })}</span>
                      <span className="text-[18px] leading-6 font-medium tabular-nums text-foreground">{fmt(event.event_date, { day: 'numeric' })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[15px] font-medium text-foreground">{event.name}</h3>
                      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {[event.location, plural(event.race_categories?.[0]?.count || 0, 'category', 'categories')].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card px-4 py-12 text-center">
              <p className="text-[15px] text-foreground">{search ? 'No events found' : 'No events available'}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {search ? 'Try a different search or time period' : 'New races appear here when organizers publish them'}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
