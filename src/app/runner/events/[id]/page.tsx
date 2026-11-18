import { StatusTag, statusLabel } from '@/components/ui/status-tag'
import { ArrowLeft, CircleCheck, CreditCard, Footprints, Images, MapPin, QrCode, ShoppingBag, Trophy } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import { isConfirmedStatus } from '@/lib/registration-status'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RunnerRegistrationActions } from '@/components/events/runner-registration-actions'
import { CancelRegistrationButton } from '@/components/events/cancel-registration-button'
import { VirtualCertificateButton } from '@/components/gamification/virtual-certificate-button'
import { RaceDayScheduleCard } from '@/components/runner/race-day-schedule-card'
import { EventThemeScope } from '@/components/theme/event-theme-scope'
import { getSurfaceTheme } from '@/lib/theme/surface'
import { resolveLabels } from '@/lib/theme/labels'
import { fetchOrganizerName } from '@/lib/supabase/safe-name'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Event details - Pelikat',
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
      .select('id, t_shirt_size, full_name, emergency_contact_name, emergency_contact_phone, dob, gender, phone, ic_encrypted, ic_document_path')
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

  // Post-visibility only (safe-name contract): the event row loaded through the
  // RLS client, so a hidden draft never reaches the service-role read below.
  // Shortcut: the joined name (owners/admins can read organizers) wins; the
  // service fetch only fills the runner path where RLS hides organizers.
  const themedLabels = (await getSurfaceTheme(event, supabase))?.labels ?? null
  const labels = themedLabels ?? resolveLabels(null)
  const organizerName =
    (event.organizers?.name as string | undefined) ||
    (await fetchOrganizerName(event.organizer_id)) ||
    'Unknown organizer'

  const { data: registration } = await supabase
    .from('registrations')
    .select('*, race_categories(*)')
    .eq('event_id', id)
    .eq('runner_id', profile?.id)
    .single()

  const isRegistered = !!registration
  const isVirtual = (event.event_type as string | null) === 'virtual'

  // "Open" = published AND inside the reg window (null/absent bounds stay
  // open). Same derivation as the public /events/[slug] page — the
  // register_for_event RPC (058) rejects out-of-window submits with a 400,
  // so gate the CTA here before any submit is attempted.
  const now = new Date()
  const registrationOpen =
    event.status === 'published' &&
    (event.reg_open == null || new Date(event.reg_open) <= now) &&
    (event.reg_close == null || new Date(event.reg_close) >= now)

  // Virtual run progress: logged distance for this event vs target
  const { data: myLogs } = isVirtual && isRegistered
    ? await supabase.from('run_logs').select('distance_km').eq('event_id', id).eq('runner_id', profile?.id)
    : { data: null }
  const loggedKm = (myLogs ?? []).reduce((acc, l) => acc + Number(l.distance_km || 0), 0)
  const targetKm = Number(event.target_distance_km || 0)
  const raceCategories = (event.race_categories ?? []) as RaceCategory[]
  const eventDate = new Date(event.event_date)

  return (
    <EventThemeScope event={event} showAssets>
      <div className="flex flex-col w-full min-h-full bg-background">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border">
          <div className="flex items-center h-14 px-4 pt-safe">
            <Link href="/runner/events" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
              <ArrowLeft className="size-[24px]" />
            </Link>
            <h1 className="flex-1 text-[16px] font-medium text-foreground text-center mr-8 truncate">
              {event.name}
            </h1>
          </div>
        </header>

        <div className="flex flex-col gap-3 px-5 pt-6">
          <div className="flex items-center gap-2">
            <StatusTag status={event.status}>{statusLabel(event.status)}</StatusTag>
            {isVirtual && <StatusTag tone="primary">Virtual run</StatusTag>}
          </div>
          <h2 className="text-[26px] leading-8 font-medium text-foreground">
            {event.name}
          </h2>
        </div>

        <div className="flex flex-col px-5 py-6 gap-6">
        
          {/* Date & Location */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4">
              <div className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-border/60 py-1.5">
                <span className="text-[11px] text-muted-foreground">{eventDate.toLocaleDateString('en-MY', { month: 'short' })}</span>
                <span className="text-[18px] leading-6 font-medium tabular-nums text-foreground">{eventDate.getDate()}</span>
              </div>
              <span className="text-[15px] text-foreground">
                {eventDate.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>

            <RaceDayScheduleCard
              startTime={(event.start_time as string | null) ?? null}
              flagOffTime={(event.flag_off_time as string | null) ?? null}
              cutoffTime={(event.cutoff_time as string | null) ?? null}
            />
          
            {event.location && (
              <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60">
                  <MapPin className="size-5 text-muted-foreground" strokeWidth={1.75} />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] text-muted-foreground">Location</span>
                  <span className="text-[15px] text-foreground">{event.location}</span>
                </div>
              </div>
            )}
          </section>

          {/* About */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[16px] font-medium text-foreground">About the race</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {event.description || 'No description available for this event.'}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[12px] text-muted-foreground">Organized by</span>
              <span className="text-[12px] font-medium text-foreground">{organizerName}</span>
            </div>
          </section>

          {/* Registration Section */}
          <section className="mt-4 pt-6 border-t border-border/60 flex flex-col gap-4">
            <h3 className="text-[16px] font-medium text-foreground">My registration</h3>
          
            {isRegistered ? (
              <div className="flex flex-col gap-4">
                <div className="p-5 rounded-2xl bg-success/10 border border-success/20 flex flex-col gap-4 relative overflow-hidden">
                  <div className="flex items-center gap-3">
                    <CircleCheck className="size-[24px] text-success" />
                    <div className="flex flex-col">
                      <span className="text-[14px] font-medium text-success">You&apos;re registered</span>
                      <span className="text-[12px] text-muted-foreground">See you at the start line</span>
                    </div>
                  </div>
                
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    {!isVirtual && (
                      <div className="flex flex-col">
                        <span className="text-[11px] text-muted-foreground font-medium mb-1">{labels.bib_label}</span>
                        <span className="text-[16px] font-mono font-medium text-foreground">{registration.bib_number || 'TBA'}</span>
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-[11px] text-muted-foreground font-medium mb-1">Category</span>
                      <span className="text-[14px] font-medium text-foreground truncate">{registration.race_categories?.name}</span>
                    </div>
                    {isVirtual && targetKm > 0 && (
                      <div className="flex flex-col col-span-2 pt-3 border-t border-success/20">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[11px] text-muted-foreground font-medium">Progress</span>
                          <span className="text-[11px] font-medium text-success">
                            {loggedKm.toFixed(1)} / {targetKm} km
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-success"
                            style={{ width: `${Math.min(100, Math.round((loggedKm / targetKm) * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 border-t border-success/20 col-span-2">
                      <span className="text-[11px] text-muted-foreground font-medium">Payment status</span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-foreground">
                        {statusLabel(registration.payment_status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                  {!isVirtual && (
                    <Link
                      href={`/runner/events/${event.id}/bib`}
                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <QrCode className="size-[18px]" />
                      View {labels.bib_label}
                    </Link>
                  )}

                  {!isConfirmedStatus(registration.payment_status) && (
                    <Link
                      href={`/runner/events/${event.id}/payment`}
                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <CreditCard className="size-[18px]" />
                      Complete payment
                    </Link>
                  )}
                  <Link
                    href={`/runner/events/${event.id}/merch`}
                    className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <ShoppingBag className="size-[18px]" />
                    Event merch
                  </Link>

                  {isVirtual && targetKm > 0 && loggedKm >= targetKm && (
                    <VirtualCertificateButton eventId={event.id} />
                  )}

                  {isVirtual && (
                    <Link
                      href={`/runner/run-log?event=${event.id}`}
                      className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <Footprints className="size-[18px]" />
                      {labels.run_label}
                    </Link>
                  )}

                  {!isVirtual && (
                    <Link
                      href={`/runner/events/${event.id}/gallery`}
                      className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <Images className="size-[18px]" />
                      Event photos
                    </Link>
                  )}

                  <Link
                    href={`/runner/leaderboard?event_id=${event.id}`}
                    className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <Trophy className="size-[18px]" />
                    Event leaderboard
                  </Link>

                  {!registration.checked_in && (
                    <div className="mt-4 pt-4 border-t border-border/40">
                      <CancelRegistrationButton eventId={event.id} />
                    </div>
                  )}
                </div>
              </div>
            ) : registrationOpen ? (
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
                  icOnFile: !!(profile?.ic_encrypted || profile?.ic_document_path),
                }}
              />
            ) : (
              // Closed unregistered: 045 rejects new registrations (RPC also
              // rejects out-of-window submits with a 400 — this card is the
              // upfront gate), so no CTA — neutral card instead. Registered
              // runners keep their view above.
              <div className="p-5 rounded-2xl bg-card border border-border/60">
                <p className="text-[14px] text-muted-foreground">
                  Registration is closed for this event.
                </p>
              </div>
            )}
          </section>

        </div>
      </div>
    </EventThemeScope>
  )
}
