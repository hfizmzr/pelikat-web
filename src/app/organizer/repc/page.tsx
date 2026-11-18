import { MapPin, QrCode } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import { isConfirmedStatus } from '@/lib/registration-status'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Kit collection - Pelikat',
  description: 'Race entry pack collection station management and check-in tracking',
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

  const totalPaid = events?.flatMap(e => e.registrations || []).filter(r => isConfirmedStatus(r.payment_status)).length || 0
  const totalCheckedIn = events?.flatMap(e => e.registrations || []).filter(r => r.checked_in).length || 0
  const overallRate = totalPaid > 0 ? Math.round((totalCheckedIn / totalPaid) * 100) : 0

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Kit collection</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Race entry packs collected at the counter, by event</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: 'Collected', value: `${overallRate}%`, sub: `${totalCheckedIn.toLocaleString()} of ${totalPaid.toLocaleString()} confirmed runners` },
            { label: 'Still to collect', value: (totalPaid - totalCheckedIn).toLocaleString(), sub: 'Confirmed runners without their pack' },
            { label: 'Confirmed runners', value: totalPaid.toLocaleString(), sub: 'Paid or complimentary entries' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-5">
              <p className="text-[13px] text-muted-foreground">{s.label}</p>
              <p className="mt-2 text-[32px] leading-none font-medium tabular-nums text-foreground">{s.value}</p>
              <p className="mt-2 text-[13px] text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </div>

        {activeEvents.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[16px] font-medium text-foreground">By event</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {activeEvents.map(event => {
                const regs = event.registrations || []
                const paid = regs.filter(r => isConfirmedStatus(r.payment_status)).length
                const collected = regs.filter(r => r.checked_in).length
                const rate = paid > 0 ? Math.round((collected / paid) * 100) : 0

                return (
                  <li key={event.id} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-8">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] text-foreground">{event.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" strokeWidth={1.75} />
                        <span className="truncate">
                          {event.location || 'Location to be announced'} · {new Date(event.event_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </p>
                    </div>
                    <div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
                      </div>
                      <p className="mt-1.5 text-[12px] tabular-nums text-muted-foreground">
                        {collected} of {paid} collected · {paid - collected} to go
                      </p>
                    </div>
                    <Link
                      href={`/organizer/events/${event.id}/checkin`}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <QrCode className="size-4 text-muted-foreground" strokeWidth={1.75} />
                      Open check-in
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {activeEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center">
            <h3 className="text-[16px] font-medium text-foreground">No upcoming events</h3>
            <p className="mt-1 text-[14px] text-muted-foreground">Publish an event to track kit collection here</p>
          </div>
        )}
      </div>
    </div>
  )
}
