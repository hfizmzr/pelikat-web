'use client'

import { use, useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, CreditCard, Loader2, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { confirmDummyPayment } from '@/components/events/actions'

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [registration, setRegistration] = useState<{
    id: string
    bib_number: string
    payment_status: string
    checked_in: boolean
    events: { name: string; event_date: string; location?: string }
    race_categories: { name: string; price: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      const { data: reg } = await supabase
        .from('registrations')
        .select('*, events(*), race_categories(*)')
        .eq('event_id', id)
        .eq('runner_id', profile?.id)
        .single()

      setRegistration(reg)
      setLoading(false)
    })()
  }, [id, supabase])

  const handlePayment = () => {
    setError(null)
    startTransition(async () => {
      try {
        if (!registration) throw new Error('Registration not found')
        await confirmDummyPayment(registration.id)
        setSuccess(true)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Payment failed')
      }
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!registration) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Registration not found</p>
        <Link href={`/runner/events/${id}`}>
          <Button variant="outline" className="mt-4">Back to Event</Button>
        </Link>
      </div>
    )
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
          <h1 className="text-3xl font-bold tracking-tight">Payment</h1>
          <p className="text-muted-foreground">{registration.events?.name}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Order Summary
              </CardTitle>
              <CardDescription>Review your registration before payment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Event</span>
                  <span>{registration.events?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <span>{registration.race_categories?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">BIB</span>
                  <span className="font-mono">{registration.bib_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={registration.payment_status === 'paid' ? 'default' : 'secondary'}>
                    {registration.payment_status}
                  </Badge>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>RM {registration.race_categories?.price ?? 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {success ? (
            <Card className="border-green-500/50 bg-green-500/5">
              <CardContent className="flex items-center gap-3 py-6">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <div>
                  <p className="font-medium text-green-500">Payment Successful</p>
                  <p className="text-sm text-muted-foreground">
                    Your registration is confirmed. View your digital BIB for race day.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Dummy Payment Gateway</CardTitle>
                <CardDescription>
                  This simulates a payment confirmation. No real transaction occurs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button className="w-full" onClick={handlePayment} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  {isPending ? 'Processing...' : 'Confirm Payment'}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Clicking this will mark your registration as paid for demonstration purposes.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Event Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{new Date(registration.events?.event_date).toLocaleDateString()}</span>
              </div>
              {registration.events?.location && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span>{registration.events?.location}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
