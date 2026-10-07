'use client'

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
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#ffb4ab]/10 text-[#ffb4ab] text-[13px] font-bold active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[18px]">cancel</span>
        Cancel Registration
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl bg-[#ffb4ab]/5 border border-[#ffb4ab]/20">
      <p className="text-[12px] text-[#ffb4ab] text-center font-medium">Are you sure you want to cancel?</p>
      <div className="flex gap-2">
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-lg bg-[#ffb4ab] text-[#690005] text-[12px] font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          {isPending ? 'Canceling...' : 'Yes, Cancel'}
        </button>
        <button
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-lg bg-[#2a2a2c] text-[#e5e1e4] text-[12px] font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          Keep It
        </button>
      </div>
    </div>
  )
}
