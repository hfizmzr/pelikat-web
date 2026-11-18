import { LoaderCircle, TrendingUp } from "lucide-react"
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import OrganizerAnalyticsCharts, { type AnalyticsData } from '@/components/organizer/analytics-charts'
import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Analytics - Pelikat',
  description: 'Track your event performance, runner demographics, and revenue analytics',
}

function calculateAge(dob: string | null): number | null {
  if (!dob) return null
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--
  return age
}

function getAgeGroup(age: number | null): string {
  if (age === null) return 'Unknown'
  if (age < 20) return '<20'
  if (age < 30) return '20-29'
  if (age < 40) return '30-39'
  if (age < 50) return '40-49'
  return '50+'
}

export default async function OrganizerAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  if (!organizerId) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <TrendingUp className="size-[64px] mb-4" />
        <h2 className="text-[18px] font-medium text-foreground mb-2">No organizer profile</h2>
        <p className="text-[14px]">No analytics data available without an organizer account.</p>
      </div>
    )
  }

  const [{ data: events }, { data: registrations }] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, event_date, status')
      .eq('organizer_id', organizerId)
      .order('event_date', { ascending: false }),
    supabase
      .from('registrations')
      .select(`
        *,
        events(name),
        race_categories(name, price),
        runner_id
      `)
      .eq('organizer_id', organizerId),
  ])

  // Re-attach runner demographics via the organizer-safe view (raw
  // runner_profiles rows / embeds are no longer organizer-readable).
  // DOB is excluded from the view; age groups become 'Unknown'.
  const profileById = await getSafeRunnerProfiles(
    supabase,
    (registrations ?? []).map(reg => (reg as { runner_id?: string | null }).runner_id)
  )
  const registrationsWithProfiles = (registrations ?? []).map((reg) => ({
    ...reg,
    runner_profiles: profileById.get((reg as { runner_id?: string | null }).runner_id ?? '') ?? null,
  }))

  const totalEvents = events?.length ?? 0
  const totalRegistrations = registrations?.length ?? 0
  const totalRevenue = registrations?.reduce((acc, r) => {
    const price = r.race_categories?.price ?? 0
    return r.payment_status === 'paid' ? acc + Number(price) : acc
  }, 0) ?? 0
  const checkedInCount = registrations?.filter((r) => r.checked_in).length ?? 0
  const checkInRate = totalRegistrations > 0 ? Math.round((checkedInCount / totalRegistrations) * 100) : 0

  const eventStats = (events ?? []).map((event) => {
    const eventRegs = registrations?.filter((r) => r.event_id === event.id) ?? []
    const paid = eventRegs.filter((r) => r.payment_status === 'paid')
    const checkedIn = eventRegs.filter((r) => r.checked_in)
    const revenue = paid.reduce((sum, r) => sum + Number(r.race_categories?.price ?? 0), 0)
    // Note: `paid` here is revenue-classified (paid-only, excludes
    // waived complimentary rows) because it feeds revenue math below.
    return { name: event.name, total: eventRegs.length, paid: paid.length, checkedIn: checkedIn.length, revenue }
  })

  const genderMap: Record<string, number> = {}
  const ageMap: Record<string, number> = {}
  const shirtMap: Record<string, number> = {}

  for (const reg of registrationsWithProfiles) {
    const profile = reg.runner_profiles as { gender: string | null; dob: string | null; t_shirt_size: string | null } | null
    const gender = profile?.gender ?? 'Unknown'
    genderMap[gender] = (genderMap[gender] ?? 0) + 1
    const ageGroup = getAgeGroup(calculateAge(profile?.dob ?? null))
    ageMap[ageGroup] = (ageMap[ageGroup] ?? 0) + 1
    const size = profile?.t_shirt_size ?? 'Unknown'
    shirtMap[size] = (shirtMap[size] ?? 0) + 1
  }

  const genderData = Object.entries(genderMap).map(([label, value]) => ({ label, value }))
  const ageData = ['<20', '20-29', '30-39', '40-49', '50+', 'Unknown']
    .map((label) => ({ label, value: ageMap[label] ?? 0 }))
    .filter((d) => d.value > 0 || d.label === 'Unknown')
  const shirtData = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Unknown']
    .map((label) => ({ label, value: shirtMap[label] ?? 0 }))
    .filter((d) => d.value > 0 || d.label === 'Unknown')

  const analyticsData: AnalyticsData = {
    eventStats,
    demographics: { gender: genderData, ageGroups: ageData, shirtSizes: shirtData },
    totalRevenue,
  }

  const kpis = [
    { label: 'Events', value: totalEvents, suffix: '' },
    { label: 'Runners', value: totalRegistrations, suffix: '' },
    { label: 'Gross revenue', value: `RM ${totalRevenue.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`, suffix: '' },
    { label: 'Check-in rate', value: checkInRate, suffix: '%' },
  ]

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Analytics</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Registrations, revenue and runner demographics across your events</p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpis.map(k => (
            <div key={k.label} className="rounded-xl border border-border bg-card p-5">
              <p className="text-[13px] text-muted-foreground">{k.label}</p>
              <p className="mt-2 text-[28px] leading-none font-medium tabular-nums text-foreground">
                {typeof k.value === 'number' ? k.value.toLocaleString() : k.value}{k.suffix}
              </p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <Suspense
          fallback={
            <div className="bg-card rounded-xl border border-border p-12 flex items-center justify-center">
              <LoaderCircle className="size-6 text-muted-foreground animate-spin" />
            </div>
          }
        >
          <OrganizerAnalyticsCharts data={analyticsData} />
        </Suspense>
      </div>
    </div>
  )
}
