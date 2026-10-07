import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Explore Events - Pelikat',
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

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl px-5 pt-safe pb-4 border-b border-[#23232b]">
        <div className="h-14 flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-[#e5e1e4] tracking-tight">Explore Events</h1>
          <button className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1c1b1d] border border-[#353437]/60 text-[#cbc3d7] active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-[20px]">filter_list</span>
          </button>
        </div>

        {/* Search Bar */}
        <form action="/runner/events" method="GET" className="mt-2 relative">
          <input type="hidden" name="period" value={period} />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[20px] text-[#958ea0]">search</span>
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search events, locations..."
            className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#1c1b1d] border border-[#353437]/60 text-[14px] text-[#e5e1e4] placeholder-[#958ea0] focus:outline-none focus:border-[#d0bcff]/50 focus:ring-1 focus:ring-[#d0bcff]/50 transition-all"
          />
          {search && (
            <Link
              href={`/runner/events?period=${period}`}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#353437] text-[#e5e1e4]"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </Link>
          )}
        </form>

        {/* Tabs */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto hide-scrollbar">
          {tabs.map(tab => {
            const active = period === tab.value
            return (
              <Link
                key={tab.value}
                href={`/runner/events?period=${tab.value}${search ? `&search=${search}` : ''}`}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-[13px] font-semibold transition-colors border ${
                  active
                    ? 'bg-[#d0bcff] text-[#3c0091] border-[#d0bcff]'
                    : 'bg-[#1c1b1d] text-[#cbc3d7] border-[#353437]/60 hover:border-[#cbc3d7]/30'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6">
        {/* Your Registered Events (only if not searching strictly and there are some) */}
        {joinedEvents.length > 0 && !search && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-bold text-[#e5e1e4] tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#4edea3]">how_to_reg</span>
              Your Registered Events
            </h2>
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-5 px-5 snap-x hide-scrollbar">
              {joinedEvents.map(event => {
                const reg = myRegistrations?.find(r => r.event_id === event.id)
                return (
                  <Link
                    key={event.id}
                    href={`/runner/events/${event.id}/bib`}
                    className="snap-start shrink-0 w-[240px] flex flex-col p-4 bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4edea3]">
                        {new Date(event.event_date).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#4edea3]/10 text-[#4edea3] border border-[#4edea3]/20">
                        {reg?.payment_status === 'paid' ? 'PAID' : reg?.payment_status?.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-[14px] font-bold text-[#e5e1e4] leading-tight mb-3 line-clamp-2">
                      {event.name}
                    </h3>
                    <div className="mt-auto flex items-center gap-1.5 text-[11px] text-[#958ea0]">
                      <span className="material-symbols-outlined text-[14px]">sell</span>
                      <span className="truncate">{reg?.race_categories?.name}</span>
                      <span className="mx-1">•</span>
                      <span className="font-mono text-[#cbc3d7]">BIB {reg?.bib_number || 'TBA'}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Discover Feed */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[15px] font-bold text-[#e5e1e4] tracking-tight">
            {search ? 'Search Results' : 'Discover Events'}
          </h2>

          <div className="flex flex-col gap-4">
            {unjoinedEvents.length > 0 ? (
              unjoinedEvents.map(event => (
                <Link
                  key={event.id}
                  href={`/runner/events/${event.id}`}
                  className="flex flex-col rounded-2xl overflow-hidden bg-[#1c1b1d] border border-[#353437]/60 active:scale-[0.98] transition-transform"
                >
                  <div className="h-24 bg-[#23232b] relative">
                    {/* Placeholder for event banner image */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1c1b1d] to-transparent opacity-80" />
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-[#131315]/80 backdrop-blur-md border border-[#353437] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-[#d0bcff]">calendar_today</span>
                      <span className="text-[11px] font-bold text-[#e5e1e4]">
                        {new Date(event.event_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 pt-2">
                    <h3 className="text-[16px] font-bold text-[#e5e1e4] leading-snug mb-1.5">
                      {event.name}
                    </h3>
                    {event.location && (
                      <p className="flex items-center gap-1.5 text-[12px] text-[#958ea0] mb-3">
                        <span className="material-symbols-outlined text-[14px]">location_on</span>
                        <span className="truncate">{event.location}</span>
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-[#23232b] text-[10px] font-semibold text-[#cbc3d7]">
                          {event.race_categories?.[0]?.count || 0} Categories
                        </span>
                      </div>
                      <span className="px-4 py-1.5 rounded-full bg-[#d0bcff]/10 text-[#d0bcff] text-[12px] font-bold">
                        Details
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl bg-[#1c1b1d] border border-[#353437]/40">
                <div className="w-12 h-12 bg-[#201f22] rounded-full flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[24px] text-[#958ea0]">search_off</span>
                </div>
                <p className="text-[14px] font-bold text-[#e5e1e4] mb-1">
                  {search ? 'No events found' : 'No events available'}
                </p>
                <p className="text-[12px] text-[#958ea0]">
                  {search ? `Try adjusting your search terms or filters.` : `Check back later for new events.`}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
