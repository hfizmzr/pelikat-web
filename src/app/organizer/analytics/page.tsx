import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import OrganizerAnalyticsCharts, { type AnalyticsData } from '@/components/organizer/analytics-charts'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Telemetry & Analytics - Organizer Hub | Pelikat',
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
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-[#958ea0]">
        <span className="material-symbols-outlined text-[64px] mb-4">insights</span>
        <h2 className="text-[18px] font-semibold text-[#e5e1e4] mb-2">No organizer profile</h2>
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
        runner_profiles(gender, dob, t_shirt_size)
      `)
      .eq('organizer_id', organizerId),
  ])

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
    return { name: event.name, total: eventRegs.length, paid: paid.length, checkedIn: checkedIn.length, revenue }
  })

  const genderMap: Record<string, number> = {}
  const ageMap: Record<string, number> = {}
  const shirtMap: Record<string, number> = {}

  for (const reg of registrations ?? []) {
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
    { label: 'Total Events', value: totalEvents, icon: 'flag', color: 'text-[#d0bcff]', suffix: '' },
    { label: 'Total Runners', value: totalRegistrations, icon: 'group', color: 'text-[#4cd7f6]', suffix: '' },
    { label: 'Gross Revenue', value: `RM ${totalRevenue.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`, icon: 'payments', color: 'text-[#4edea3]', suffix: '' },
    { label: 'Check-in Rate', value: checkInRate, icon: 'fact_check', color: 'text-[#d0bcff]', suffix: '%' },
  ]

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      <div className="absolute -top-20 left-0 w-80 h-80 bg-[#4cd7f6]/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 right-0 w-[30rem] h-[30rem] bg-[#d0bcff]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#4cd7f6]/10 text-[#acedff] uppercase w-fit">
            Telemetry
          </span>
          <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">Telemetry & Analytics</h1>
          <p className="text-[14px] leading-[20px] text-[#cbc3d7]">Track event performance, runner demographics, and revenue trends.</p>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(k => (
            <div key={k.label} className="bg-[#1c1b1d] rounded-xl p-5 border border-[#23232b]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium">{k.label}</span>
                <span className={`material-symbols-outlined text-[20px] ${k.color}`}>{k.icon}</span>
              </div>
              <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">
                {typeof k.value === 'number' ? k.value.toLocaleString() : k.value}{k.suffix}
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <Suspense
          fallback={
            <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] p-12 flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px] text-[#d0bcff] animate-spin">progress_activity</span>
            </div>
          }
        >
          <OrganizerAnalyticsCharts data={analyticsData} />
        </Suspense>
      </div>
    </div>
  )
}
