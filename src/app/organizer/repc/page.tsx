import { CircleCheck, Clock, MapPin, QrCode } from "lucide-react"
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
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      <div className="absolute top-0 right-0 w-[30rem] h-[30rem] bg-success/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success uppercase w-fit">
                Live Station
              </span>
              <span className="flex items-center gap-1.5 text-success text-[12px]">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                REPC Active
              </span>
            </div>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">REPC Station</h1>
            <p className="text-[14px] leading-[20px] text-muted-foreground">Race Entry Pack Collection — manage counters, track collection rates.</p>
          </div>
          <Link href="/organizer/events">
            <button className="px-4 py-2.5 bg-success/20 text-success hover:bg-success/30 text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 transition-colors border border-success/20 shadow-sm">
              <span className="size-[18px]"><QrCode className="size-[18px]" /></span>
              Launch Scanner HUD
            </button>
          </Link>
        </div>

        {/* Global stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-6 border border-muted flex items-center gap-4">
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle className="fill-none stroke-accent" cx="50" cy="50" r="38" strokeWidth="8" />
                <circle
                  className="fill-none stroke-success"
                  cx="50" cy="50" r="38"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="238.8"
                  strokeDashoffset={238.8 - (238.8 * overallRate / 100)}
                />
              </svg>
              <span className="absolute text-[16px] font-bold text-foreground">{overallRate}%</span>
            </div>
            <div>
              <div className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium mb-1">Collection Rate</div>
              <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-foreground">{totalCheckedIn.toLocaleString()}</div>
              <div className="text-[12px] text-muted-foreground">of {totalPaid.toLocaleString()} packs issued</div>
            </div>
          </div>

          {[
            { label: 'Awaiting Collection', value: totalPaid - totalCheckedIn, icon: Clock, color: 'text-primary' },
            { label: 'Total Confirmed', value: totalPaid, icon: CircleCheck, color: 'text-success' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl p-6 border border-muted flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center">
                <span className={`size-[28px] ${s.color}`}><s.icon className="size-[28px]" /></span>
              </div>
              <div>
                <div className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium mb-1">{s.label}</div>
                <div className="text-[32px] leading-[40px] tracking-[-0.02em] font-bold text-foreground">{s.value.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Per-event REPC breakdown */}
        {activeEvents.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">Event Collection Status</h2>
            <div className="flex flex-col gap-3">
              {activeEvents.map(event => {
                const regs = event.registrations || []
                const paid = regs.filter(r => r.payment_status === 'paid').length
                const collected = regs.filter(r => r.checked_in).length
                const rate = paid > 0 ? Math.round((collected / paid) * 100) : 0

                return (
                  <div key={event.id} className="bg-card rounded-xl p-5 border border-muted flex items-center gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div>
                          <div className="text-[15px] leading-[20px] font-semibold text-foreground">{event.name}</div>
                          <div className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <span className="size-[14px]"><MapPin className="size-[14px]" /></span>
                            {event.location || 'TBD'} • {new Date(event.event_date).toLocaleDateString('en-MY')}
                          </div>
                        </div>
                        <span className={`text-[14px] font-semibold ${rate >= 80 ? 'text-success' : rate >= 50 ? 'text-primary' : 'text-red-300'}`}>
                          {rate}%
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                          <span>{collected} of {paid} packs collected</span>
                          <span className="text-muted-foreground">{paid - collected} remaining</span>
                        </div>
                        <div className="w-full bg-accent rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-success' : rate >= 50 ? 'bg-primary' : 'bg-red-300'}`}
                            style={{ width: `${Math.max(rate, 1)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <Link href={`/organizer/events/${event.id}/checkin`}>
                      <button className="shrink-0 px-4 py-2 bg-card hover:bg-accent text-foreground text-[12px] font-medium rounded-lg flex items-center gap-1.5 border border-border transition-colors">
                        <span className="size-[16px]"><QrCode className="size-[16px]" /></span>
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
          <div className="bg-card rounded-xl border border-muted p-12 flex flex-col items-center justify-center text-center">
            <span className="size-[64px] text-border mb-4"><QrCode className="size-[64px] text-border mb-4" /></span>
            <h3 className="text-[18px] font-semibold text-foreground mb-2">No active events</h3>
            <p className="text-[14px] text-muted-foreground">Publish an event to enable REPC collection tracking</p>
          </div>
        )}
      </div>
    </div>
  )
}
