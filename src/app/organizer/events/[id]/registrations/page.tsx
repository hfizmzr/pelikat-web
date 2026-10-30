import { createClient } from '@/lib/supabase/server'
import { isConfirmedStatus } from '@/lib/registration-status'
import { notFound } from 'next/navigation'
import { RegistrationsClient } from '@/components/events/registrations-client'
import { ComplimentaryGuestsClient } from '@/components/events/complimentary-guests-client'
import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Registrations - Pelikat',
  description: 'Manage event registrations',
}

export default async function OrganizerEventRegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const [{ data: event }, { data: categories }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', id).single(),
    supabase.from('race_categories').select('id, name').eq('event_id', id).order('name'),
  ])

  if (!event) {
    notFound()
  }

  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, bib_number, checked_in, payment_status, guest_name, guest_phone, registration_role, runner_id, race_categories(name)')
    .eq('event_id', id)
    .order('created_at', { ascending: false })

  // Re-attach runner names via the organizer-safe view (raw
  // runner_profiles rows / embeds are no longer organizer-readable;
  // phone is excluded from the view, so the phone column now shows '-').
  const profileById = await getSafeRunnerProfiles(
    supabase,
    (registrations ?? []).map(reg => reg.runner_id as string | null)
  )

  const rows = (registrations ?? []).map((reg) => {
    const runner = profileById.get((reg.runner_id as string) ?? '')
    const cat = Array.isArray(reg.race_categories) ? reg.race_categories[0] : reg.race_categories
    return {
      id: reg.id as string,
      bib_number: reg.bib_number as string,
      checked_in: (reg.checked_in ?? false) as boolean,
      payment_status: (reg.payment_status ?? 'pending') as string,
      guest_name: (reg.guest_name ?? null) as string | null,
      guest_phone: (reg.guest_phone ?? null) as string | null,
      registration_role: (reg.registration_role ?? 'runner') as string,
      runner_profiles: runner ? { full_name: runner.full_name ?? '', phone: '' } : null,
      race_categories: cat ? { name: cat.name ?? '' } : null,
    }
  })

  const stats = {
    total: rows.length,
    checkedIn: rows.filter(r => r.checked_in).length,
    paid: rows.filter(r => isConfirmedStatus(r.payment_status)).length,
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 py-6">
      <ComplimentaryGuestsClient
        eventId={id}
        categories={(categories ?? []) as { id: string; name: string }[]}
      />
      <RegistrationsClient
        eventName={event.name}
        registrations={rows}
        stats={stats}
      />
    </div>
  )
}
