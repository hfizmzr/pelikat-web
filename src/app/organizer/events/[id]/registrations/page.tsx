import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { RegistrationsClient } from '@/components/events/registrations-client'
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

  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const { data: registrations } = await supabase
    .from('registrations')
    .select('id, bib_number, checked_in, payment_status, runner_profiles(full_name, phone), race_categories(name)')
    .eq('event_id', id)
    .order('created_at', { ascending: false })

  const rows = (registrations ?? []).map((reg) => {
    const runner = Array.isArray(reg.runner_profiles) ? reg.runner_profiles[0] : reg.runner_profiles
    const cat = Array.isArray(reg.race_categories) ? reg.race_categories[0] : reg.race_categories
    return {
      id: reg.id as string,
      bib_number: reg.bib_number as string,
      checked_in: (reg.checked_in ?? false) as boolean,
      payment_status: (reg.payment_status ?? 'pending') as string,
      runner_profiles: runner ? { full_name: runner.full_name ?? '', phone: runner.phone ?? '' } : null,
      race_categories: cat ? { name: cat.name ?? '' } : null,
    }
  })

  const stats = {
    total: rows.length,
    checkedIn: rows.filter(r => r.checked_in).length,
    paid: rows.filter(r => r.payment_status === 'paid').length,
  }

  return (
    <RegistrationsClient
      eventName={event.name}
      registrations={rows}
      stats={stats}
    />
  )
}
