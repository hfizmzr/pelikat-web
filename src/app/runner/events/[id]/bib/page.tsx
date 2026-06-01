import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import QRCode from 'qrcode'
import { ArrowLeft, Download, Share2 } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchDjangoApi } from '@/lib/django'

export default async function RunnerBibPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id, full_name')
    .eq('user_id', user?.id)
    .single()

  const { data: registration } = await supabase
    .from('registrations')
    .select('*, events(*), race_categories(*)')
    .eq('event_id', id)
    .eq('runner_id', profile?.id)
    .single()

  const { data: event } = await supabase
    .from('events')
    .select('name, event_date, location')
    .eq('id', id)
    .single()

  if (!registration || !event) {
    notFound()
  }

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
        color: { dark: '#000000', light: '#ffffff' },
      })
    }
  } catch {
    qrError = 'Secure QR service is unavailable. Please refresh after the API is running.'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
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
        <Card className="border-border w-full max-w-md">
          <CardHeader className="text-center">
            <Badge variant="outline" className="w-fit mx-auto mb-2">
              BIB NUMBER
            </Badge>
            <CardTitle className="text-6xl font-bold tracking-wider">
              {registration.bib_number}
            </CardTitle>
            <CardDescription>{profile?.full_name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            {qrSvg ? (
              <div
                className="bg-white p-4 rounded-lg"
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
            </div>

            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1">
                <Download className="mr-2 h-4 w-4" />
                Save
              </Button>
              <Button variant="outline" className="flex-1">
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Show this QR code at the check-in point on race day.</p>
          <p>2. The race official will scan your code to verify your registration.</p>
          <p>3. Make sure your phone screen is bright enough for scanning.</p>
          <p>4. Take a screenshot as a backup in case of poor network connectivity.</p>
        </CardContent>
      </Card>
    </div>
  )
}
