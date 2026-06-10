import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart3, TrendingUp, Users, DollarSign } from 'lucide-react'
import OrganizerAnalyticsCharts, { type AnalyticsData } from '@/components/organizer/analytics-charts'

// ── Helpers ─────────────────────────────────────────────────────────────────

function calculateAge(dob: string | null): number | null {
  if (!dob) return null
  const birthDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OrganizerAnalyticsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  if (!organizerId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Track your event performance and revenue</p>
        </div>
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No organizer profile found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Fetch data ─────────────────────────────────────────────────────────────
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

  // ── Compute stats ──────────────────────────────────────────────────────────
  const totalEvents = events?.length ?? 0
  const totalRegistrations = registrations?.length ?? 0
  const totalRevenue =
    registrations?.reduce((acc, r) => {
      const price = r.race_categories?.price ?? 0
      return r.payment_status === 'paid' ? acc + Number(price) : acc
    }, 0) ?? 0

  const checkedInCount = registrations?.filter((r) => r.checked_in).length ?? 0
  const checkInRate = totalRegistrations > 0 ? Math.round((checkedInCount / totalRegistrations) * 100) : 0

  // ── Per-event stats ────────────────────────────────────────────────────────
  const eventStats = (events ?? []).map((event) => {
    const eventRegs = registrations?.filter((r) => r.event_id === event.id) ?? []
    const paid = eventRegs.filter((r) => r.payment_status === 'paid')
    const checkedIn = eventRegs.filter((r) => r.checked_in)
    const revenue = paid.reduce((sum, r) => sum + Number(r.race_categories?.price ?? 0), 0)

    return {
      name: event.name,
      total: eventRegs.length,
      paid: paid.length,
      checkedIn: checkedIn.length,
      revenue,
    }
  })

  // ── Demographics ───────────────────────────────────────────────────────────
  const genderMap: Record<string, number> = {}
  const ageMap: Record<string, number> = {}
  const shirtMap: Record<string, number> = {}

  for (const reg of registrations ?? []) {
    const profile = reg.runner_profiles as { gender: string | null; dob: string | null; t_shirt_size: string | null } | null

    // Gender
    const gender = profile?.gender ?? 'Unknown'
    genderMap[gender] = (genderMap[gender] ?? 0) + 1

    // Age
    const age = calculateAge(profile?.dob ?? null)
    const ageGroup = getAgeGroup(age)
    ageMap[ageGroup] = (ageMap[ageGroup] ?? 0) + 1

    // T-shirt
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
    demographics: {
      gender: genderData,
      ageGroups: ageData,
      shirtSizes: shirtData,
    },
    totalRevenue,
  }

  // ── Stats cards ──────────────────────────────────────────────────────────────
  const stats = [
    {
      title: 'Total Events',
      value: totalEvents,
      icon: BarChart3,
    },
    {
      title: 'Total Registrations',
      value: totalRegistrations,
      icon: Users,
    },
    {
      title: 'Total Revenue',
      value: `RM ${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
    },
    {
      title: 'Check-in Rate',
      value: `${checkInRate}%`,
      icon: TrendingUp,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Track your event performance and revenue</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-28 rounded-md" />
              ))}
            </div>
            <div className="rounded-lg border p-6 space-y-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-[300px] w-full rounded-md" />
            </div>
          </div>
        }
      >
        <OrganizerAnalyticsCharts data={analyticsData} />
      </Suspense>
    </div>
  )
}
