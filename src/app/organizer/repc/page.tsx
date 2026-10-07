import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'REPC Station - Organizer Hub | Pelikat',
  description: 'Race Entry Pack Collection station management and check-in tracking',
}

export default async function OrganizerRepcPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  // Get all events with check-in stats
  const { data: events } = await supabase
    .from('events')
    .select(`
      id, name, status, event_date, location,
      registrations(id, checked_in, payment_status)
    `)
    .eq('organizer_id', organizerId)
    .eq('status', 'published')
    .order('event_date', { ascending: true })

  const now = new Date()
  const activeEvents = events?.filter(e => new Date(e.event_date) >= now) || []

  const totalPaid = events?.flatMap(e => e.registrations || []).filter(r => r.payment_status === 'paid').length || 0
  const totalCheckedIn = events?.flatMap(e => e.registrations || []).filter(r => r.checked_in).length || 0
  const overallRate = totalPaid > 0 ? Math.round((totalCheckedIn / totalPaid) * 100) : 0

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      <div className="absolute top-0 right-0 w-[30rem] h-[30rem] bg-[#4edea3]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#4edea3]/10 text-[#6ffbbe] uppercase w-fit">
                Live Station
              </span>
              <span className="flex items-center gap-1.5 text-[#4edea3] text-[12px]">
                <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
                REPC Active
              </span>
            </div>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">REPC Station</h1>
            <p className="text-[14px] leading-[20px] text-[#cbc3d7]">Race Entry Pack Collection — manage counters, track collection rates.</p>
          </div>
          <Link href="/organizer/events">
            <button className="px-4 py-2.5 bg-[#4edea3]/20 text-[#4edea3] hover:bg-[#4edea3]/30 text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 transition-colors border border-[#4edea3]/20 shadow-sm">
              <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
              Launch Scanner HUD
            </button>
          </Link>
        </div>

        {/* Global stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle className="fill-none stroke-[#353437]" cx="50" cy="50" r="38" strokeWidth="8" />
                <circle
                  className="fill-none stroke-[#4edea3]"
                  cx="50" cy="50" r="38"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="238.8"
                  strokeDashoffset={238.8 - (238.8 * overallRate / 100)}
                />
              </svg>
              <span className="absolute text-[16px] font-bold text-[#e5e1e4]">{overallRate}%</span>
            </div>
            <div>
              <div className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium mb-1">Collection Rate</div>
              <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">{totalCheckedIn.toLocaleString()}</div>
              <div className="text-[12px] text-[#958ea0]">of {totalPaid.toLocaleString()} packs issued</div>
            </div>
          </div>

          {[
            { label: 'Awaiting Collection', value: totalPaid - totalCheckedIn, icon: 'schedule', color: 'text-[#d0bcff]' },
            { label: 'Total Confirmed', value: totalPaid, icon: 'check_circle', color: 'text-[#4edea3]' },
          ].map(s => (
            <div key={s.label} className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#201f22] flex items-center justify-center">
                <span className={`material-symbols-outlined text-[28px] ${s.color}`}>{s.icon}</span>
              </div>
              <div>
                <div className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium mb-1">{s.label}</div>
                <div className="text-[32px] leading-[40px] tracking-[-0.02em] font-bold text-[#e5e1e4]">{s.value.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Per-event REPC breakdown */}
        {activeEvents.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-[#e5e1e4]">Event Collection Status</h2>
            <div className="flex flex-col gap-3">
              {activeEvents.map(event => {
                const regs = event.registrations || []
                const paid = regs.filter(r => r.payment_status === 'paid').length
                const collected = regs.filter(r => r.checked_in).length
                const rate = paid > 0 ? Math.round((collected / paid) * 100) : 0

                return (
                  <div key={event.id} className="bg-[#1c1b1d] rounded-xl p-5 border border-[#23232b] flex items-center gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div>
                          <div className="text-[15px] leading-[20px] font-semibold text-[#e5e1e4]">{event.name}</div>
                          <div className="text-[12px] text-[#958ea0] flex items-center gap-1 mt-0.5">
                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                            {event.location || 'TBD'} • {new Date(event.event_date).toLocaleDateString('en-MY')}
                          </div>
                        </div>
                        <span className={`text-[14px] font-semibold ${rate >= 80 ? 'text-[#4edea3]' : rate >= 50 ? 'text-[#d0bcff]' : 'text-[#ffb4ab]'}`}>
                          {rate}%
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-[#cbc3d7] mb-1.5">
                          <span>{collected} of {paid} packs collected</span>
                          <span className="text-[#958ea0]">{paid - collected} remaining</span>
                        </div>
                        <div className="w-full bg-[#353437] rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-[#4edea3]' : rate >= 50 ? 'bg-[#d0bcff]' : 'bg-[#ffb4ab]'}`}
                            style={{ width: `${Math.max(rate, 1)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <Link href={`/organizer/events/${event.id}/checkin`}>
                      <button className="shrink-0 px-4 py-2 bg-[#201f22] hover:bg-[#2a2a2c] text-[#e5e1e4] text-[12px] font-medium rounded-lg flex items-center gap-1.5 border border-[#353437] transition-colors">
                        <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                        Check-in
                      </button>
                    </Link>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {activeEvents.length === 0 && (
          <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] p-12 flex flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined text-[64px] text-[#494454] mb-4">qr_code_scanner</span>
            <h3 className="text-[18px] font-semibold text-[#e5e1e4] mb-2">No active events</h3>
            <p className="text-[14px] text-[#958ea0]">Publish an event to enable REPC collection tracking</p>
          </div>
        )}
      </div>
    </div>
  )
}
