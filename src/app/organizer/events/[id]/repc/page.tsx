import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardCheck, QrCode, Shirt, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RepcInventoryForm } from '@/components/events/repc-inventory-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

type ShirtSize = (typeof SHIRT_SIZES)[number]

type RunnerProfile = {
  t_shirt_size: string | null
}

type RegistrationWithProfile = {
  id: string
  checked_in: boolean | null
  runner_profiles: RunnerProfile | RunnerProfile[] | null
}

type InventoryRecord = {
  size: string
  initial_qty: number | null
  claimed_qty: number | null
}

function getRunnerProfile(registration: RegistrationWithProfile) {
  const profile = registration.runner_profiles
  return Array.isArray(profile) ? profile[0] : profile
}

function normalizeSize(size: unknown): ShirtSize | null {
  if (typeof size !== 'string') return null
  const normalized = size.toUpperCase()
  return SHIRT_SIZES.includes(normalized as ShirtSize) ? (normalized as ShirtSize) : null
}

export default async function OrganizerEventRepcPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, name, event_date, status')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const [{ data: inventory }, { data: registrations }] = await Promise.all([
    supabase
      .from('event_shirt_inventory')
      .select('size, initial_qty, claimed_qty')
      .eq('event_id', id)
      .order('size', { ascending: true }),
    supabase
      .from('registrations')
      .select('id, checked_in, runner_profiles(t_shirt_size)')
      .eq('event_id', id),
  ])

  const inventoryRows = (inventory ?? []) as InventoryRecord[]
  const registrationRows = (registrations ?? []) as RegistrationWithProfile[]

  const inventoryBySize = new Map(
    inventoryRows.map((row) => [
      row.size,
      {
        initialQty: row.initial_qty ?? 0,
        claimedQty: row.claimed_qty ?? 0,
      },
    ])
  )

  const demandBySize = new Map<ShirtSize, number>(SHIRT_SIZES.map((size) => [size, 0]))
  let missingShirtSize = 0
  let checkedIn = 0

  for (const registration of registrationRows) {
    if (registration.checked_in) checkedIn += 1

    const size = normalizeSize(getRunnerProfile(registration)?.t_shirt_size)
    if (size) {
      demandBySize.set(size, (demandBySize.get(size) ?? 0) + 1)
    } else {
      missingShirtSize += 1
    }
  }

  const rows = SHIRT_SIZES.map((size) => {
    const stock = inventoryBySize.get(size)

    return {
      size,
      demand: demandBySize.get(size) ?? 0,
      initialQty: stock?.initialQty ?? 0,
      claimedQty: stock?.claimedQty ?? 0,
    }
  })

  const totalRegistered = registrationRows.length
  const totalPrepared = rows.reduce((sum, row) => sum + row.initialQty, 0)
  const totalClaimed = rows.reduce((sum, row) => sum + row.claimedQty, 0)
  const totalRemaining = rows.reduce(
    (sum, row) => sum + Math.max(row.initialQty - row.claimedQty, 0),
    0
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/organizer/events/${event.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">REPC Inventory</h1>
              <Badge variant="outline">{event.status}</Badge>
            </div>
            <p className="text-muted-foreground">{event.name}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/organizer/events/${event.id}/registrations`}>
            <Button variant="outline">
              <Users className="mr-2 h-4 w-4" />
              Registrations
            </Button>
          </Link>
          <Link href={`/organizer/events/${event.id}/checkin`}>
            <Button>
              <QrCode className="mr-2 h-4 w-4" />
              Scanner
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Registered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRegistered}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Prepared Shirts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPrepared}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Claimed Shirts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClaimed}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRemaining}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shirt className="h-5 w-5" />
              Shirt Inventory
            </CardTitle>
            <CardDescription>Quantities are checked against shirts already claimed.</CardDescription>
          </CardHeader>
          <CardContent>
            <RepcInventoryForm eventId={event.id} rows={rows} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                REPC Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Checked in</span>
                <span className="font-medium">
                  {checkedIn} / {totalRegistered}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Missing shirt size</span>
                <span className="font-medium">{missingShirtSize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Event date</span>
                <span className="font-medium">
                  {new Date(event.event_date).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle>Size Demand</CardTitle>
              <CardDescription>Runner profile shirt sizes for this event.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.size}>
                      <TableCell className="font-medium">{row.size}</TableCell>
                      <TableCell className="text-right">{row.demand}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
