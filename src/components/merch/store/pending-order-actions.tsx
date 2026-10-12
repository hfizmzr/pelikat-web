'use client'

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
      <Notice tone="error" icon="timer_off">
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
        <Notice tone="warn" icon="timer">
          Items are held for you for <ReservationCountdown expiresAt={expiresAt} /> more.
        </Notice>
      )}
      {error && (
        <Notice tone="error" icon="error">
          {error}
        </Notice>
      )}
      <Link
        href={`/runner/merch/pay/${orderId}${method ? `?method=${method}` : ''}`}
        className="w-full py-3.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-[18px]">lock</span>
        Continue to payment
      </Link>
      <button
        type="button"
        onClick={cancel}
        disabled={isPending}
        className="text-[13px] font-semibold text-[#958ea0] py-2 disabled:opacity-50"
      >
        {isPending ? 'Cancelling…' : 'Cancel order'}
      </button>
    </div>
  )
}
