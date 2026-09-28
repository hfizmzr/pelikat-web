import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Race Events & Waves - Organizer Hub | Pelikat',
  description: 'Manage your running events, race waves, and category configurations',
}

export default async function OrganizerEventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let organizerId = user?.app_metadata?.organizer_id as string | undefined

  if (!organizerId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-[#958ea0]">
        <span className="material-symbols-outlined text-[64px] mb-4">flag</span>
        <h2 className="text-[18px] leading-[24px] font-semibold text-[#e5e1e4] mb-2">No organizer profile</h2>
        <p className="text-[14px]">No organizer account is linked to this user.</p>
      </div>
    )
  }

  const { data: events, error } = await supabase
    .from('events')
    .select(`
      id, name, status, event_date, location, description,
      race_categories(id, name, max_participants),
      registrations(id, payment_status, checked_in)
    `)
    .eq('organizer_id', organizerId)
    .order('event_date', { ascending: false })

  if (error) console.error('Error fetching events:', error)

  const now = new Date()
  const upcoming = events?.filter(e => new Date(e.event_date) >= now) || []
  const past = events?.filter(e => new Date(e.event_date) < now) || []

  const statusStyles: Record<string, string> = {
    published: 'text-[#4edea3] bg-[#4edea3]/15 border-[#4edea3]/20',
    draft: 'text-[#cbc3d7] bg-[#353437] border-[#494454]',
    closed: 'text-[#ffb4ab] bg-[#ffb4ab]/15 border-[#ffb4ab]/20',
    cancelled: 'text-[#ffb4ab] bg-[#ffb4ab]/15 border-[#ffb4ab]/20',
  }

  const EventCard = ({ event }: { event: NonNullable<typeof events>[0] }) => {
    const regs = event.registrations || []
    const paid = regs.filter((r: { payment_status: string }) => r.payment_status === 'paid').length
    const checkedIn = regs.filter((r: { checked_in: boolean }) => r.checked_in).length
    const cats = event.race_categories || []
    const totalCap = cats.reduce((a: number, c: { max_participants?: number | null }) => a + (c.max_participants || 0), 0)
    const fillPct = totalCap > 0 ? Math.round((regs.length / totalCap) * 100) : 0
    const daysLeft = Math.ceil((new Date(event.event_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    return (
      <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] overflow-hidden group hover:border-[#d0bcff]/30 transition-all hover:shadow-[0_0_24px_rgba(208,188,255,0.1)]">
        <div className="h-1.5 bg-gradient-to-r from-[#d0bcff] via-[#a078ff] to-[#4cd7f6]" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex flex-col gap-1 min-w-0">
              <h3 className="text-[16px] leading-[24px] font-semibold text-[#e5e1e4] group-hover:text-[#d0bcff] transition-colors">{event.name}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] leading-[16px] text-[#958ea0] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                  {new Date(event.event_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {daysLeft > 0 && daysLeft < 60 && (
                  <span className="text-[10px] leading-[14px] px-2 py-0.5 rounded-full bg-[#d0bcff]/10 text-[#d0bcff] font-semibold">
                    {daysLeft}d left
                  </span>
                )}
              </div>
            </div>
            <span className={`shrink-0 text-[10px] leading-[14px] px-2.5 py-1 rounded-full font-semibold border ${statusStyles[event.status] || statusStyles.draft}`}>
              {event.status}
            </span>
          </div>

          {event.location && (
            <p className="text-[12px] leading-[16px] text-[#958ea0] flex items-center gap-1 mb-4">
              <span className="material-symbols-outlined text-[14px]">location_on</span>
              {event.location}
            </p>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { icon: 'badge', label: 'Registered', value: regs.length },
              { icon: 'payments', label: 'Paid', value: paid },
              { icon: 'fact_check', label: 'Checked In', value: checkedIn },
            ].map(stat => (
              <div key={stat.label} className="bg-[#201f22] rounded-lg p-2.5 flex flex-col gap-0.5">
                <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">{stat.value}</span>
                <span className="text-[10px] leading-[14px] text-[#958ea0]">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Fill bar */}
          {totalCap > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-[11px] text-[#cbc3d7] mb-1.5">
                <span>{regs.length} of {totalCap} slots</span>
                <span className={fillPct >= 90 ? 'text-[#ffb4ab] font-semibold' : 'text-[#958ea0]'}>{fillPct}%</span>
              </div>
              <div className="w-full bg-[#353437] rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${fillPct >= 90 ? 'bg-[#ffb4ab]' : fillPct >= 70 ? 'bg-[#d0bcff]' : 'bg-[#4cd7f6]'}`}
                  style={{ width: `${Math.max(fillPct, 1)}%` }}
                />
              </div>
            </div>
          )}

          {/* Categories tags */}
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {cats.slice(0, 3).map((cat: { id: string; name: string }) => (
                <span key={cat.id} className="text-[10px] leading-[14px] px-2 py-0.5 rounded border border-[#494454] text-[#cbc3d7]">
                  {cat.name}
                </span>
              ))}
              {cats.length > 3 && (
                <span className="text-[10px] leading-[14px] px-2 py-0.5 rounded border border-[#494454] text-[#958ea0]">
                  +{cats.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[#23232b]">
            <div className="flex gap-1.5">
              <Link href={`/organizer/events/${event.id}/registrations`}>
                <button className="p-2 rounded-lg text-[#958ea0] hover:text-[#e5e1e4] hover:bg-[#2a2a2c] transition-colors" title="Registrations">
                  <span className="material-symbols-outlined text-[18px]">badge</span>
                </button>
              </Link>
              <Link href={`/organizer/events/${event.id}/checkin`}>
                <button className="p-2 rounded-lg text-[#958ea0] hover:text-[#4edea3] hover:bg-[#2a2a2c] transition-colors" title="Check-in">
                  <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                </button>
              </Link>
            </div>
            <Link href={`/organizer/events/${event.id}`}>
              <button className="px-4 py-2 bg-[#201f22] hover:bg-[#2a2a2c] text-[#e5e1e4] text-[12px] leading-[16px] tracking-[0.02em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-[#353437]">
                Manage
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      {/* Ambient */}
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-[#d0bcff]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#d0bcff]/10 text-[#e9ddff] uppercase">
                Event Console
              </span>
            </div>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">Race Events & Waves</h1>
            <p className="text-[14px] leading-[20px] text-[#cbc3d7]">Create, configure, and manage your running events and race categories.</p>
          </div>
          <Link href="/organizer/events/new">
            <button className="px-5 py-2.5 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-[#a078ff] transition-all shadow-[0_0_16px_rgba(208,188,255,0.25)] whitespace-nowrap">
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Create Event
            </button>
          </Link>
        </div>

        {/* Summary bar */}
        {events && events.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Events', value: events.length, icon: 'flag', color: 'text-[#d0bcff]' },
              { label: 'Published', value: events.filter(e => e.status === 'published').length, icon: 'check_circle', color: 'text-[#4edea3]' },
              { label: 'Upcoming', value: upcoming.length, icon: 'calendar_clock', color: 'text-[#4cd7f6]' },
              { label: 'Total Runners', value: events.reduce((a, e) => a + (e.registrations?.length || 0), 0), icon: 'group', color: 'text-[#d0bcff]' },
            ].map(s => (
              <div key={s.label} className="bg-[#1c1b1d] rounded-xl p-4 border border-[#23232b] flex items-center gap-3">
                <span className={`material-symbols-outlined text-[24px] ${s.color}`}>{s.icon}</span>
                <div>
                  <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">{s.value.toLocaleString()}</div>
                  <div className="text-[11px] text-[#958ea0]">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming Events */}
        {upcoming.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
              <h2 className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">Upcoming Events</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4edea3]/15 text-[#4edea3] font-semibold">{upcoming.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map(event => <EventCard key={event.id} event={event} />)}
            </div>
          </section>
        )}

        {/* Past Events */}
        {past.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-[#cbc3d7]">Past Events</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#353437] text-[#958ea0] font-semibold">{past.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
              {past.map(event => <EventCard key={event.id} event={event} />)}
            </div>
          </section>
        )}

        {/* Empty state */}
        {(!events || events.length === 0) && (
          <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-[#d0bcff]/10 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-[48px] text-[#d0bcff]">flag</span>
            </div>
            <h3 className="text-[22px] leading-[28px] font-semibold text-[#e5e1e4] mb-2">No events yet</h3>
            <p className="text-[14px] leading-[20px] text-[#958ea0] mb-8 max-w-sm">
              Create your first race event to start building waves, accepting registrations, and managing participants.
            </p>
            <Link href="/organizer/events/new">
              <button className="px-6 py-3 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-[#a078ff] transition-all shadow-[0_0_20px_rgba(208,188,255,0.3)]">
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                Create your first event
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}