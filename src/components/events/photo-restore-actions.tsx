'use client'

import { Loader2, RotateCcw } from 'lucide-react'
import { restoreRejectedPhoto } from '@/components/events/actions'
import { PhotoSubmitButton, usePhotoAction } from '@/components/events/photo-action'

interface PhotoRestoreActionsProps {
  eventId: string
  storagePath: string
}

export function PhotoRestoreActions({
  eventId,
  storagePath,
}: PhotoRestoreActionsProps) {
  const [state, action] = usePhotoAction(restoreRejectedPhoto)

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
      <PhotoSubmitButton
        variant="outline"
        pendingLabel={<><Loader2 className="h-4 w-4 animate-spin" />Restore to Review</>}
      >
        <RotateCcw className="h-4 w-4" />
        Restore to Review
      </PhotoSubmitButton>
    </form>
  )
}
