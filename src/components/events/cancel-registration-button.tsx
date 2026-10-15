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
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 dark:bg-red-300/10 text-red-500 dark:text-red-300 text-[13px] font-bold active:scale-95 transition-transform"
      >
        <X className="size-[18px]" />
        Cancel Registration
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-red-500/10 dark:bg-red-300/5 border border-red-500/30 dark:border-red-300/20">
      <p className="text-[12px] text-red-500 dark:text-red-300 text-center font-medium">Are you sure you want to cancel?</p>
      <div className="flex gap-2">
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-lg bg-red-500 dark:bg-red-300 text-red-900 text-[12px] font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          {isPending ? 'Canceling...' : 'Yes, Cancel'}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-lg bg-accent text-foreground text-[12px] font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          Keep It
        </button>
      </div>
    </div>
  )
}
