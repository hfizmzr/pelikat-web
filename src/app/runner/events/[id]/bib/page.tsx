import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import QRCode from 'qrcode'
import { ArrowLeft, CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchDjangoApi } from '@/lib/django'
import { BibActionButtons } from '@/components/events/bib-action-buttons'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Digital BIB - Pelikat',
  description: 'Your digital race BIB with QR code',
}

export default async function RunnerBibPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id, full_name')
    .eq('user_id', user?.id)
    .single()

  const [{ data: registration }, { data: event }] = await Promise.all([
    supabase
      .from('registrations')
      .select('*, events(*), race_categories(*)')
      .eq('event_id', id)
      .eq('runner_id', profile?.id)
      .single(),
    supabase
      .from('events')
      .select('name, event_date, location')
      .eq('id', id)
      .single(),
  ])

  if (!registration || !event) {
    notFound()
  }

  const isCheckedIn = Boolean(registration.checked_in)
  const checkedInAt = isCheckedIn && registration.checked_in_at
    ? new Date(registration.checked_in_at).toLocaleString()
    : null

  let qrSvg: string | null = null
  let qrError: string | null = null

  try {
    const response = await fetchDjangoApi('/ai/qr/sign', {
      method: 'POST',
      body: JSON.stringify({
        runner_id: profile?.id,
        event_id: id,
        bib_number: registration.bib_number,
      }),
    })

    const qrPayload = typeof response.qr_payload === 'string' ? response.qr_payload : null
    if (!qrPayload) {
      qrError = 'Secure QR code could not be generated.'
    } else {
      qrSvg = await QRCode.toString(qrPayload, {
        type: 'svg',
        width: 200,
        margin: 2,
        color: { dark: isCheckedIn ? '#15803d' : '#000000', light: '#ffffff' },
      })
    }
  } catch {
    qrError = 'Secure QR service is unavailable. Please refresh after the API is running.'
  }

  return (
    <div className="bib-print-page space-y-6 print:space-y-0">
      <div className="bib-print-hide flex items-center gap-4">
        <Link href={`/runner/events/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Digital BIB</h1>
          <p className="text-muted-foreground">{event.name}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <Card
          className={`bib-print-card w-full max-w-md print:border print:border-neutral-300 print:bg-white print:text-black print:shadow-none ${
            isCheckedIn
              ? 'border-green-500/60 bg-green-500/5'
              : 'border-border'
          }`}
        >
          <CardHeader className="text-center">
            <Badge
              variant={isCheckedIn ? 'default' : 'outline'}
              className={`w-fit mx-auto mb-2 ${
                isCheckedIn ? 'bg-green-600 text-white hover:bg-green-600' : ''
              }`}
            >
              {isCheckedIn ? (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  CHECKED IN
                </>
              ) : (
                'BIB NUMBER'
              )}
            </Badge>
            <CardTitle className="text-6xl font-bold tracking-wider">
              {registration.bib_number}
            </CardTitle>
            <CardDescription>{profile?.full_name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            {qrSvg ? (
              <div
                className={`rounded-lg p-4 ${
                  isCheckedIn ? 'bg-green-50 ring-2 ring-green-500/40' : 'bg-white'
                }`}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="flex min-h-[232px] w-[232px] items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {qrError}
              </div>
            )}

            <div className="w-full space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Event</span>
                <span className="font-medium">{event.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {new Date(event.event_date).toLocaleDateString()}
                </span>
              </div>
              {event.location && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium">{event.location}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">
                  {registration.race_categories?.name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="bib-print-muted text-muted-foreground">REPC Status</span>
                <span className={isCheckedIn ? 'bib-print-status font-medium text-green-600' : 'font-medium'}>
                  {isCheckedIn ? 'Checked In' : 'Not Checked In'}
                </span>
              </div>
              {checkedInAt && (
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Checked In At</span>
                  <span className="text-right font-medium">{checkedInAt}</span>
                </div>
              )}
            </div>

            <BibActionButtons
              bibNumber={registration.bib_number}
              eventName={event.name}
            />
            <Link href={`/runner/events/${id}/bib/consent`} className="bib-print-hide block">
              <Button variant="outline" className="w-full">
                Generate Proxy Collection Code
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="bib-print-hide border-border">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {isCheckedIn ? (
            <p className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Your race pack has been collected. Keep this BIB for race-day reference.
            </p>
          ) : (
            <>
              <p>1. Show this QR code at the check-in point on race day.</p>
              <p>2. The race official will scan your code to verify your registration.</p>
              <p>3. Make sure your phone screen is bright enough for scanning.</p>
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Take a screenshot as a backup in case of poor network connectivity.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
