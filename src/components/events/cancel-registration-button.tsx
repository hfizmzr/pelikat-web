'use client'

import { X } from "lucide-react"
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelRegistration } from '@/components/events/actions'

export function CancelRegistrationButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleCancel = () => {
    startTransition(async () => {
      try {
        await cancelRegistration(eventId)
        router.refresh()
      } catch (e) {
        console.error(e)
      }
    })
  }

  if (!showConfirm) {
    return (
      <button
        onClick={() => setShowConfirm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive/10 text-destructive text-[13px] font-medium active:scale-[0.98] transition-transform"
      >
        <X className="size-[18px]" />
        Cancel registration
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-destructive/10 dark:bg-destructive/5 border border-destructive/30 dark:border-destructive/20">
      <p className="text-[12px] text-destructive text-center font-medium">Are you sure you want to cancel?</p>
      <div className="flex gap-2">
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-lg bg-destructive text-white dark:text-background text-[12px] font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {isPending ? 'Canceling...' : 'Yes, cancel'}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-lg bg-accent text-foreground text-[12px] font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          Keep it
        </button>
      </div>
    </div>
  )
}
