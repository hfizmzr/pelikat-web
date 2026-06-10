'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Loader2, CheckCircle, Building2 } from 'lucide-react'

interface Organizer {
  id: string
  name: string
  slug: string
  contact_email: string | null
  sub_expires_at: string | null
}

export default function OrganizerPaymentPage() {
  const router = useRouter()
  const supabase = createClient()
  const [organizer, setOrganizer] = useState<Organizer | null>(null)
  const [isPaying, setIsPaying] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const SUBSCRIPTION_PRICE = 99

  useEffect(() => {
    async function loadOrganizer() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user?.app_metadata?.organizer_id) {
        router.push('/')
        return
      }

      const { data } = await supabase
        .from('organizers')
        .select('id, name, slug, contact_email, sub_expires_at')
        .eq('id', user.app_metadata.organizer_id)
        .single()

      if (data) {
        setOrganizer(data)
      }
      setLoading(false)
    }

    loadOrganizer()
  }, [router, supabase])

  const handlePayment = async () => {
    setError(null)
    setIsPaying(true)

    if (!organizer) {
      setError('Organizer not found')
      setIsPaying(false)
      return
    }

    const oneYearFromNow = new Date()
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)

    const { error: updateError } = await supabase
      .from('organizers')
      .update({ sub_expires_at: oneYearFromNow.toISOString() })
      .eq('id', organizer.id)

    if (updateError) {
      setError(updateError.message || 'Payment failed. Please try again.')
      setIsPaying(false)
      return
    }

    // Log payment event
    await supabase.from('audit_log').insert({
      action: 'organizer_subscription_payment',
      target_id: organizer.id,
      metadata: {
        organizer_name: organizer.name,
        amount: SUBSCRIPTION_PRICE,
        sub_expires_at: oneYearFromNow.toISOString(),
      },
    })

    setSuccess(true)
    setIsPaying(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!organizer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Organizer not found</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md border-green-500/50 bg-green-500/5">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Payment Successful</CardTitle>
            <CardDescription>
              Your subscription is now active
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Workspace</span>
                <span className="font-medium">{organizer.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-medium">RM {SUBSCRIPTION_PRICE}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valid Until</span>
                <span className="font-medium text-green-600">
                  {new Date().getFullYear() + 1}
                </span>
              </div>
            </div>
            <Button className="w-full" onClick={() => router.push('/organizer')}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Complete Your Setup</h1>
          <p className="text-muted-foreground mt-1">
            Activate your workspace to start managing events
          </p>
        </div>

        {/* Order Summary */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Details
            </CardTitle>
            <CardDescription>Review your workspace subscription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Workspace</span>
                <span className="font-medium">{organizer.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Slug</span>
                <span className="font-mono text-muted-foreground">{organizer.slug}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">Organizer Annual</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">Pending Payment</Badge>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>RM {SUBSCRIPTION_PRICE} / year</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mock Payment Gateway */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Payment Gateway</CardTitle>
            <CardDescription>
              This simulates a card payment. No real transaction occurs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Mock card fields */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">Card Number</label>
                <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground font-mono">
                  **** **** **** 4242
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Expiry</label>
                  <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground font-mono">
                    12/28
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">CVC</label>
                  <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground font-mono">
                    ***
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Cardholder Name</label>
                <div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {organizer.name}
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handlePayment}
              disabled={isPaying}
            >
              {isPaying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              {isPaying ? 'Processing...' : `Pay RM ${SUBSCRIPTION_PRICE}`}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Clicking Pay will activate a 1-year subscription for demonstration purposes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
