import { ArrowLeft, CircleCheck, CreditCard, Images, MapPin, QrCode, Trophy } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RunnerRegistrationActions } from '@/components/events/runner-registration-actions'
import { CancelRegistrationButton } from '@/components/events/cancel-registration-button'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Event Details - Pelikat',
  description: 'View event details and register for races',
}

interface RaceCategory {
  id: string
  name: string
  gender: string | null
  min_age: number | null
  max_age: number | null
  price: number | null
  max_slots: number | null
}

export default async function RunnerEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase
      .from('runner_profiles')
      .select('id, t_shirt_size, full_name, emergency_contact_name, emergency_contact_phone, dob, gender, phone, ic_encrypted')
      .eq('user_id', user?.id)
      .single(),
    supabase
      .from('events')
      .select('*, organizers(name), race_categories(*)')
      .eq('id', id)
      .single(),
  ])

  if (!event) {
    notFound()
  }

  const { data: registration } = await supabase
    .from('registrations')
    .select('*, race_categories(*)')
    .eq('event_id', id)
    .eq('runner_id', profile?.id)
    .single()

  const isRegistered = !!registration
  const raceCategories = (event.race_categories ?? []) as RaceCategory[]
  const eventDate = new Date(event.event_date)

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner/events" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <span className="size-[24px]"><ArrowLeft className="size-[24px]" /></span>
          </Link>
          <h1 className="flex-1 text-[16px] font-bold text-foreground text-center mr-8 truncate">
            {event.name}
          </h1>
        </div>
      </header>

      {/* Hero Banner Placeholder */}
      <div className="w-full h-48 bg-muted relative">
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent opacity-90" />
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
          <div className="flex flex-col">
            <span className="px-2 py-1 mb-2 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              {event.status}
            </span>
            <h2 className="text-[24px] font-bold text-foreground leading-tight drop-shadow-md">
              {event.name}
            </h2>
          </div>
        </div>
      </div>

      <div className="flex flex-col px-5 py-6 gap-6">
        
        {/* Date & Location */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
            <div className="w-12 h-12 bg-accent/50 rounded-xl flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-red-300 uppercase">{eventDate.toLocaleDateString('en-MY', { month: 'short' })}</span>
              <span className="text-[16px] font-extrabold text-foreground leading-none">{eventDate.getDate()}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-foreground">
                {eventDate.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric' })}
              </span>
              <span className="text-[12px] text-muted-foreground">Starts at 6:00 AM</span>
            </div>
          </div>
          
          {event.location && (
            <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
              <div className="w-12 h-12 bg-accent/50 rounded-xl flex items-center justify-center">
                <span className="size-[20px] text-primary"><MapPin className="size-[20px] text-primary" /></span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-foreground">Event Location</span>
                <span className="text-[12px] text-muted-foreground">{event.location}</span>
              </div>
            </div>
          )}
        </section>

        {/* About */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[16px] font-bold text-foreground">About the Race</h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {event.description || 'No description available for this event.'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[12px] text-muted-foreground">Organized by:</span>
            <span className="text-[12px] font-bold text-foreground">{event.organizers?.name || 'Unknown Organizer'}</span>
          </div>
        </section>

        {/* Registration Section */}
        <section className="mt-4 pt-6 border-t border-border/60 flex flex-col gap-4">
          <h3 className="text-[16px] font-bold text-foreground">Registration</h3>
          
          {isRegistered ? (
            <div className="flex flex-col gap-4">
              <div className="p-5 rounded-2xl bg-success/10 border border-success/20 flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-success/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                <div className="flex items-center gap-3">
                  <span className="size-[24px] text-success"><CircleCheck className="size-[24px] text-success" /></span>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-success">You&apos;re Registered!</span>
                    <span className="text-[11px] text-success/80">See you at the start line.</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">BIB Number</span>
                    <span className="text-[16px] font-mono font-bold text-foreground">{registration.bib_number || 'TBA'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Category</span>
                    <span className="text-[14px] font-bold text-foreground truncate">{registration.race_categories?.name}</span>
                  </div>
                  <div className="flex flex-col col-span-2 pt-3 border-t border-success/20">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payment Status</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-muted text-foreground">
                        {registration.payment_status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-2">
                <Link
                  href={`/runner/events/${event.id}/bib`}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <QrCode className="size-[18px]" />
                  View Digital BIB Pass
                </Link>

                {registration.payment_status !== 'paid' && (
                  <Link
                    href={`/runner/events/${event.id}/payment`}
                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <CreditCard className="size-[18px]" />
                    Complete Payment
                  </Link>
                )}
                
                <Link
                  href={`/runner/events/${event.id}/gallery`}
                  className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Images className="size-[18px]" />
                  Event Photos
                </Link>

                <Link
                  href={`/runner/leaderboard?event_id=${event.id}`}
                  className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Trophy className="size-[18px]" />
                  Event Leaderboard
                </Link>

                {!registration.checked_in && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <CancelRegistrationButton eventId={event.id} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <RunnerRegistrationActions
              eventId={event.id}
              categories={raceCategories}
              hasRunnerProfile={!!profile}
              runner={{
                name: profile?.full_name ?? null,
                email: user?.email ?? null,
                tShirtSize: profile?.t_shirt_size ?? null,
                emergencyContactName: profile?.emergency_contact_name ?? null,
                emergencyContactPhone: profile?.emergency_contact_phone ?? null,
                dob: profile?.dob ?? null,
                gender: profile?.gender ?? null,
                phone: profile?.phone ?? null,
                icOnFile: !!profile?.ic_encrypted,
              }}
              eventSummary={{
                name: event.name,
                date: eventDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
                location: event.location,
              }}
            />
          )}
        </section>

      </div>
    </div>
  )
}
