import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'

async function getOrganizerEvents() {
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
  if (!organizerId) return []

  const { data: events } = await supabase
    .from('events')
    .select(`
      id, name, status, event_date, location, description,
      race_categories(id, name, max_slots),
      registrations(id, payment_status, checked_in)
    `)
    .eq('organizer_id', organizerId)
    .order('event_date', { ascending: false })

  return (events || []).map((e) => {
    const regs = (e.registrations || []) as Array<{ payment_status: string; checked_in: boolean }>
    const cats = (e.race_categories || []) as Array<{ id: string; name: string; max_slots: number }>
    const totalSlots = cats.reduce((a, c) => a + (c.max_slots || 0), 0)
    const checkedIn = regs.filter((r) => r.checked_in).length
    const registered = regs.length
    const checkInPct = registered > 0 ? Math.round((checkedIn / registered) * 100) : 0

    return {
      id: e.id,
      name: e.name,
      status: e.status,
      date: e.event_date,
      location: e.location,
      totalSlots,
      registered,
      checkedIn,
      checkInPct,
      catCount: cats.length,
    }
  })
}

function statusChip(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Live', cls: 'bg-[#4edea3]/15 text-[#4edea3]' },
    published: { label: 'Open', cls: 'bg-[#4cd7f6]/15 text-[#4cd7f6]' },
    draft: { label: 'Draft', cls: 'bg-[#d0bcff]/15 text-[#d0bcff]' },
    completed: { label: 'Done', cls: 'bg-[#958ea0]/15 text-[#958ea0]' },
    cancelled: { label: 'Cancelled', cls: 'bg-[#ffb4ab]/15 text-[#ffb4ab]' },
  }
  const s = map[status] || { label: status, cls: 'bg-[#353437] text-[#cbc3d7]' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold leading-[14px] tracking-wider uppercase ${s.cls}`}>
      {s.label}
    </span>
  )
}

export default async function OrganizerMobileEventsPage() {
  const events = await getOrganizerEvents()
  const now = new Date()
  const upcoming = events.filter((e) => new Date(e.date) >= now || e.status === 'active')
  const past = events.filter((e) => new Date(e.date) < now && e.status !== 'active')

  return (
    <div className="flex flex-col w-full bg-[#131315] min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#353437]/40 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between">
          <div>
            <span className="text-[16px] font-bold text-[#e5e1e4]">My Events</span>
            <p className="text-[10px] text-[#958ea0]">{events.length} total • {upcoming.length} upcoming</p>
          </div>
          <Link
            href="/organizer/events/new"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#d0bcff] text-[#3c0091] text-[11px] font-bold active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            New
          </Link>
        </div>
      </header>

      <div className="flex flex-col px-4 py-4 space-y-5">

        {/* Upcoming Events */}
        {upcoming.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold text-[#cbc3d7] uppercase tracking-wider mb-3">
              Upcoming & Active
            </h2>
            <div className="flex flex-col gap-3">
              {upcoming.map((event) => (
                <div key={event.id} className="rounded-xl bg-[#1c1b1d] border border-[#353437]/40 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-[15px] font-bold text-[#e5e1e4] flex-1 leading-snug">
                        {event.name}
                      </h3>
                      {statusChip(event.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#cbc3d7] mb-3">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px] text-[#d0bcff]">calendar_today</span>
                        {new Date(event.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] text-[#4edea3]">location_on</span>
                          {event.location}
                        </span>
                      )}
                    </div>

                    {/* Check-in progress */}
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] text-[#958ea0] mb-1">
                        <span>{event.checkedIn} / {event.registered} checked in</span>
                        <span className="text-[#4cd7f6] font-bold">{event.checkInPct}%</span>
                      </div>
                      <div className="w-full bg-[#353437] rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-[#d0bcff] h-full rounded-full"
                          style={{ width: `${event.checkInPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Link
                        href={`/organizer/events/${event.id}/checkin`}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-[#d0bcff] text-[#3c0091] text-[11px] font-bold active:scale-95 transition-transform"
                      >
                        <span className="material-symbols-outlined text-[14px]">qr_code_scanner</span>
                        Check-in
                      </Link>
                      <Link
                        href={`/organizer/events/${event.id}`}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-[#2a2a2c] text-[#cbc3d7] text-[11px] font-medium active:scale-95 transition-transform"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_full</span>
                        Details
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Past Events */}
        {past.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold text-[#cbc3d7] uppercase tracking-wider mb-3">
              Past Events
            </h2>
            <div className="flex flex-col gap-2">
              {past.map((event) => (
                <Link
                  key={event.id}
                  href={`/organizer/events/${event.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#1c1b1d] border border-[#353437]/30 active:scale-95 transition-transform"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#353437] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-[#958ea0]">event</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#cbc3d7] truncate">{event.name}</p>
                    <p className="text-[10px] text-[#958ea0]">
                      {new Date(event.date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} • {event.registered} runners
                    </p>
                  </div>
                  {statusChip(event.status)}
                </Link>
              ))}
            </div>
          </section>
        )}

        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-[#958ea0]">
            <span className="material-symbols-outlined text-[48px] mb-3">event_busy</span>
            <p className="text-[14px] font-medium">No events yet</p>
            <p className="text-[12px] mt-1">Create your first running event</p>
            <Link
              href="/organizer/events/new"
              className="mt-4 px-5 py-2.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold"
            >
              Create Event
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
