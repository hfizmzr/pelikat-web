'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  createCheckout,
  confirmPayment,
  getPaymentProvider,
} from '@/lib/payments/mock'
import { createHitpaySubscriptionCheckout } from '@/components/events/actions'
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
  // DB-configured single-tier price (public config endpoint, always fresh).
  const [price, setPrice] = useState<{
    amount: number
    period: string
    durationDays: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function subExpiryActive(): Promise<boolean> {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.app_metadata?.organizer_id) return false
      const { data } = await supabase
        .from('organizers')
        .select('sub_expires_at')
        .eq('id', user.app_metadata.organizer_id)
        .single()
      return !!data?.sub_expires_at && new Date(data.sub_expires_at) > new Date()
    }

    async function loadOrganizer() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user?.app_metadata?.organizer_id) {
        router.push('/')
        return
      }

      // Price comes from the config row (public read, always fresh), not a
      // hardcoded constant; the amount actually charged is snapped
      // server-side inside createHitpaySubscriptionCheckout.
      const [priceRes] = await Promise.all([
        fetch('/api/subscription/price').catch(() => null),
      ])
      if (priceRes?.ok) {
        const data = await priceRes.json().catch(() => null)
        if (data?.amount > 0) {
          setPrice({
            amount: data.amount,
            period: data.period ?? 'year',
            durationDays: data.durationDays ?? 365,
          })
        }
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

      // Returning from the HitPay hosted checkout: the signed webhook (not
      // the redirect) extends sub_expires_at server-side. Show success only
      // when the server-confirmed expiry is in the future. One mount read
      // races the webhook, so poll briefly (same pattern as the runner
      // payment page) — stop on success, cap ~30s. Errors after success
      // are moot: nothing flips success back to false.
      let alreadyActive =
        !!data?.sub_expires_at && new Date(data.sub_expires_at) > new Date()
      if (alreadyActive) {
        setSuccess(true)
        return
      }
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        if (cancelled) return
        alreadyActive = await subExpiryActive()
        if (alreadyActive) {
          setSuccess(true)
          return
        }
      }
    }

    loadOrganizer()
    return () => {
      cancelled = true
    }
  }, [router, supabase])

  const handlePayment = async () => {
    setError(null)
    setIsPaying(true)

    if (!organizer) {
      setError('Organizer not found')
      setIsPaying(false)
      return
    }

    // Real gateway flow (PAYMENT_PROVIDER=hitpay): create the payment
    // request server-side, then send the organizer to the hosted
    // checkout. Confirmation is webhook-driven — the redirect back
    // here is never trusted (see loadOrganizer above).
    if (getPaymentProvider() === 'hitpay') {
      try {
        const result = await createHitpaySubscriptionCheckout()
        if (result.ok) {
          window.location.href = result.checkoutUrl
        } else {
          setError(result.error)
          setIsPaying(false)
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Payment failed. Please try again.'
        )
        setIsPaying(false)
      }
      return
    }

    // Mock gateway flow (PAYMENT_PROVIDER=mock) — swap point for the
    // real provider. Mock confirmation is local because there is no
    // webhook in mock mode; DB state update only ever happens here,
    // never on the hitpay path.
    if (!price) {
      setError('Subscription pricing is temporarily unavailable. Please try again shortly.')
      setIsPaying(false)
      return
    }

    let paymentReference: string
    try {
      const session = await createCheckout({
        amount: price.amount,
        description: `Pelikat organizer subscription — ${organizer.name}`,
        referenceId: organizer.id,
        metadata: { type: 'organizer_subscription', slug: organizer.slug },
      })
      const confirmation = await confirmPayment(session)
      paymentReference = confirmation.reference
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed. Please try again.')
      setIsPaying(false)
      return
    }

    const subExpiresAt = new Date(
      Date.now() + price.durationDays * 24 * 60 * 60 * 1000
    )

    const { error: updateError } = await supabase
      .from('organizers')
      .update({ sub_expires_at: subExpiresAt.toISOString() })
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
        amount: price.amount,
        sub_expires_at: subExpiresAt.toISOString(),
        payment_provider: 'mock',
        payment_reference: paymentReference,
      },
    })

    setSuccess(true)
    setIsPaying(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!organizer) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
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
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
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
                <span className="font-medium">RM {(price?.amount ?? 0).toFixed(2)}</span>
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
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
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
                <span className="font-medium">Organizer Subscription</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">Pending Payment</Badge>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>
                  RM {(price?.amount ?? 0).toFixed(2)} / {price?.period ?? 'year'}
                </span>
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
              disabled={isPaying || !price}
            >
              {isPaying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              {isPaying
                ? 'Processing...'
                : `Pay RM ${(price?.amount ?? 0).toFixed(2)}`}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Clicking Pay will activate your {' '}
              {price ? price.durationDays : ''}-day subscription for demonstration
              purposes. Runner accounts are always free — runners pay only per
              event registration or merch order.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
