'use client'

import { CircleAlert, Lock, Timer, TimerOff } from "lucide-react"
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cancelMerchCheckout } from '@/components/merch/store-actions'
import type { MerchPaymentMethod } from '@/lib/merch'
import { ReservationCountdown, useReservationTimer } from './reservation-countdown'
import { Notice } from './store-ui'

export function PendingOrderActions({
  orderId,
  eventId,
  expiresAt,
  method,
}: {
  orderId: string
  eventId: string
  expiresAt: string | null
  method: MerchPaymentMethod | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { expired } = useReservationTimer(expiresAt)

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
      <Link
        href={`/runner/merch/pay/${orderId}${method ? `?method=${method}` : ''}`}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2"
      >
        <Lock className="size-[18px]" />
        Continue to payment
      </Link>
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
