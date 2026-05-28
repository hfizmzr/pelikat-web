'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  restoreRejectedPhoto,
  type ReviewPhotoActionState,
} from '@/components/events/actions'

const initialState: ReviewPhotoActionState = { status: 'idle' }

function RestoreButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className="h-4 w-4" />
      )}
      Restore to Review
    </Button>
  )
}

interface PhotoRestoreActionsProps {
  eventId: string
  storagePath: string
}

export function PhotoRestoreActions({
  eventId,
  storagePath,
}: PhotoRestoreActionsProps) {
  const router = useRouter()
  const [state, action] = useActionState(restoreRejectedPhoto, initialState)

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh()
    }
  }, [state.status, router])

  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="storagePath" value={storagePath} />
      {state.message && (
        <p
          className={
            state.status === 'error'
              ? 'text-xs text-destructive'
              : 'text-xs text-green-500'
          }
        >
          {state.message}
        </p>
      )}
      <RestoreButton />
    </form>
  )
}
