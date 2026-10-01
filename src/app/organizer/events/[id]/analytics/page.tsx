import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import CategoryBreakdownChart, { type CategoryStat } from '@/components/organizer/category-breakdown-chart'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Event Analytics - Pelikat',
  description: 'Per-event registration analytics',
}

interface Registration {
  id: string
  checked_in: boolean | null
  payment_status: string | null
  runner_profiles: { gender: string | null } | null
  race_categories: { id: string; name: string | null } | null
}

export default async function OrganizerEventAnalyticsPage({
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
    .select('id, name, event_date, location, status, race_categories(id, name, price), registrations(*, runner_profiles(gender), race_categories(id, name))')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const registrations = ((event.registrations ?? []) as Registration[])
  const raceCategories = (event.race_categories ?? []) as { id: string; name: string | null; price: number | null }[]

  // FR-33: registration counts by race category and gender
  const categoryStats: CategoryStat[] = raceCategories.map((cat) => {
    const regs = registrations.filter((r) => r.race_categories?.id === cat.id)
    return {
      name: cat.name ?? 'Unnamed',
      male: regs.filter((r) => r.runner_profiles?.gender === 'M').length,
      female: regs.filter((r) => r.runner_profiles?.gender === 'F').length,
      checkedIn: regs.filter((r) => r.checked_in).length,
    }
  })
  const uncategorised = registrations.filter((r) => !r.race_categories || !raceCategories.some((c) => c.id === r.race_categories?.id))
  if (uncategorised.length > 0) {
    categoryStats.push({
      name: 'Unassigned',
      male: uncategorised.filter((r) => r.runner_profiles?.gender === 'M').length,
      female: uncategorised.filter((r) => r.runner_profiles?.gender === 'F').length,
      checkedIn: uncategorised.filter((r) => r.checked_in).length,
    })
  }

  const total = registrations.length
  const checkedIn = registrations.filter((r) => r.checked_in).length
  const checkInRate = total > 0 ? Math.round((checkedIn / total) * 100) : 0
  const paid = registrations.filter((r) => r.payment_status === 'paid').length
  const priceById = new Map(raceCategories.map((c) => [c.id, Number(c.price ?? 0)]))
  const revenue = registrations.reduce(
    (sum, r) => sum + (priceById.get(r.race_categories?.id ?? '') ?? 0),
    0
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/organizer/events/${id}`}>
          <ArrowLeft className="h-5 w-5 text-muted-foreground hover:text-foreground" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Analytics — {event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(event.event_date).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Badge variant={event.status === 'published' ? 'default' : 'secondary'}>
          {event.status}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">{paid} paid</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checkedIn}</div>
            <p className="text-xs text-muted-foreground mt-1">{checkInRate}% check-in rate</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{raceCategories.length}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#4edea3]">RM {revenue.toLocaleString('en-MY', { maximumFractionDigits: 0 })}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Registrations by Race Category</CardTitle>
          <CardDescription>
            Broken down by gender and check-in status (FR-33)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryBreakdownChart data={categoryStats} />
        </CardContent>
      </Card>
    </div>
  )
}
