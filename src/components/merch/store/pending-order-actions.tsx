'use client'

import { CircleAlert, Lock, Timer, TimerOff } from "lucide-react"
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cancelMerchCheckout, resumeMerchCheckout } from '@/components/merch/store-actions'
import { ReservationCountdown, useReservationTimer } from './reservation-countdown'
import { Notice } from './store-ui'

export function PendingOrderActions({
  orderId,
  eventId,
  expiresAt,
}: {
  orderId: string
  eventId: string
  expiresAt: string | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { expired } = useReservationTimer(expiresAt)

  // HitPay can return the runner before the webhook confirms payment, and
  // the order page read the status once server-side. While the order is
  // still pending, keep watching the authoritative merch_orders row and
  // re-render when it leaves pending (same pattern as the runner payment
  // page). The status is never flipped locally, and the watch is capped
  // at 10 tries × 3 s so it never polls forever.
  useEffect(() => {
    const supabase = createClient()
    let attempts = 0
    let inFlight = false

    const poll = window.setInterval(async () => {
      if (inFlight) return
      if (attempts >= 10) {
        window.clearInterval(poll)
        return
      }
      attempts += 1
      inFlight = true
      const { data: order } = await supabase
        .from('merch_orders')
        .select('status')
        .eq('id', orderId)
        .maybeSingle()
      inFlight = false
      const next = (order as { status?: string } | null)?.status
      if (next && next !== 'pending') {
        window.clearInterval(poll)
        router.refresh()
      }
    }, 3000)

    return () => window.clearInterval(poll)
  }, [orderId, router])

  function cancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelMerchCheckout(orderId)
      if (!result.ok) setError(result.error)
      router.refresh()
    })
  }

  if (expired) {
    return (
      <Notice tone="error" icon={TimerOff}>
        The reservation expired and the items were released.{' '}
        <Link href={`/runner/events/${eventId}/merch`} className="font-bold underline underline-offset-2">
          Check out again
        </Link>
        .
      </Notice>
    )
  }

  function resume() {
    setError(null)
    startTransition(async () => {
      const result = await resumeMerchCheckout(orderId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // HitPay hosted checkout is off-app: full navigation.
      window.location.href = result.data.checkoutUrl
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {expiresAt && (
        <Notice tone="warn" icon={Timer}>
          Items are held for you for <ReservationCountdown expiresAt={expiresAt} /> more.
        </Notice>
      )}
      {error && (
        <Notice tone="error" icon={CircleAlert}>
          {error}
        </Notice>
      )}
      <button
        type="button"
        onClick={resume}
        disabled={isPending}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
      >
        <Lock className="size-[18px]" />
        Continue to payment
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={isPending}
        className="text-[13px] font-semibold text-muted-foreground py-2 disabled:opacity-50"
      >
        {isPending ? 'Cancelling…' : 'Cancel order'}
      </button>
    </div>
  )
}
