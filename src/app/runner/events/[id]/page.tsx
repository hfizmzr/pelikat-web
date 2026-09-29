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
      .select('id')
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
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner/events" className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <h1 className="flex-1 text-[16px] font-bold text-[#e5e1e4] text-center mr-8 truncate">
            {event.name}
          </h1>
        </div>
      </header>

      {/* Hero Banner Placeholder */}
      <div className="w-full h-48 bg-[#23232b] relative">
        <div className="absolute inset-0 bg-gradient-to-t from-[#131315] to-transparent opacity-90" />
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
          <div className="flex flex-col">
            <span className="px-2 py-1 mb-2 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-[#d0bcff]/10 text-[#d0bcff] border border-[#d0bcff]/20">
              {event.status}
            </span>
            <h2 className="text-[24px] font-bold text-[#e5e1e4] leading-tight drop-shadow-md">
              {event.name}
            </h2>
          </div>
        </div>
      </div>

      <div className="flex flex-col px-5 py-6 gap-6">
        
        {/* Date & Location */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-4 bg-[#1c1b1d] p-4 rounded-2xl border border-[#353437]/60">
            <div className="w-12 h-12 bg-[#353437]/50 rounded-xl flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold text-[#ffb4ab] uppercase">{eventDate.toLocaleDateString('en-MY', { month: 'short' })}</span>
              <span className="text-[16px] font-extrabold text-[#e5e1e4] leading-none">{eventDate.getDate()}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-[#e5e1e4]">
                {eventDate.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric' })}
              </span>
              <span className="text-[12px] text-[#958ea0]">Starts at 6:00 AM</span>
            </div>
          </div>
          
          {event.location && (
            <div className="flex items-center gap-4 bg-[#1c1b1d] p-4 rounded-2xl border border-[#353437]/60">
              <div className="w-12 h-12 bg-[#353437]/50 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px] text-[#4cd7f6]">location_on</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-[#e5e1e4]">Event Location</span>
                <span className="text-[12px] text-[#958ea0]">{event.location}</span>
              </div>
            </div>
          )}
        </section>

        {/* About */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[16px] font-bold text-[#e5e1e4]">About the Race</h3>
          <p className="text-[13px] text-[#958ea0] leading-relaxed">
            {event.description || 'No description available for this event.'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[12px] text-[#cbc3d7]">Organized by:</span>
            <span className="text-[12px] font-bold text-[#e5e1e4]">{event.organizers?.name || 'Unknown Organizer'}</span>
          </div>
        </section>

        {/* Registration Section */}
        <section className="mt-4 pt-6 border-t border-[#353437]/60 flex flex-col gap-4">
          <h3 className="text-[16px] font-bold text-[#e5e1e4]">Registration</h3>
          
          {isRegistered ? (
            <div className="flex flex-col gap-4">
              <div className="p-5 rounded-2xl bg-[#4edea3]/10 border border-[#4edea3]/20 flex flex-col gap-4 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-32 h-32 bg-[#4edea3]/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[24px] text-[#4edea3]">check_circle</span>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-[#4edea3]">You're Registered!</span>
                    <span className="text-[11px] text-[#4edea3]/80">See you at the start line.</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[#cbc3d7] uppercase font-bold tracking-wider mb-1">BIB Number</span>
                    <span className="text-[16px] font-mono font-bold text-[#e5e1e4]">{registration.bib_number || 'TBA'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-[#cbc3d7] uppercase font-bold tracking-wider mb-1">Category</span>
                    <span className="text-[14px] font-bold text-[#e5e1e4] truncate">{registration.race_categories?.name}</span>
                  </div>
                  <div className="flex flex-col col-span-2 pt-3 border-t border-[#4edea3]/20">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-[#cbc3d7] uppercase font-bold tracking-wider">Payment Status</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#23232b] text-[#e5e1e4]">
                        {registration.payment_status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-2">
                <Link
                  href={`/runner/events/${event.id}/bib`}
                  className="w-full py-3.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
                  View Digital BIB Pass
                </Link>

                {registration.payment_status !== 'paid' && (
                  <Link
                    href={`/runner/events/${event.id}/payment`}
                    className="w-full py-3.5 rounded-xl bg-[#4cd7f6] text-[#00363d] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <span className="material-symbols-outlined text-[18px]">credit_card</span>
                    Complete Payment
                  </Link>
                )}
                
                <Link
                  href={`/runner/events/${event.id}/gallery`}
                  className="w-full py-3.5 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined text-[18px]">photo_library</span>
                  Event Photos
                </Link>

                {!registration.checked_in && (
                  <div className="mt-4 pt-4 border-t border-[#353437]/40">
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
            />
          )}
        </section>

      </div>
    </div>
  )
}
