'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
      <Button
        variant="outline"
        className="w-full text-destructive hover:bg-destructive/10"
        onClick={() => setShowConfirm(true)}
      >
        <XCircle className="mr-2 h-4 w-4" />
        Cancel Registration
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground text-center">Are you sure?</p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="flex-1"
          onClick={handleCancel}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Yes, Cancel
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
        >
          Keep
        </Button>
      </div>
    </div>
  )
}
