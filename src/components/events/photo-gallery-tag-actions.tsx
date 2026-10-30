'use client'

import { Loader2, RotateCcw } from 'lucide-react'
import { movePhotoTagToReview } from '@/components/events/actions'
import { PhotoSubmitButton, usePhotoAction } from '@/components/events/photo-action'

interface PhotoGalleryTagActionsProps {
  eventId: string
  photoTagId: string
}

export function PhotoGalleryTagActions({
  eventId,
  photoTagId,
}: PhotoGalleryTagActionsProps) {
  const [state, formAction] = usePhotoAction(movePhotoTagToReview)

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="photoTagId" value={photoTagId} />
      <PhotoSubmitButton
        variant="outline"
        className="h-7 bg-background/85 text-xs"
        pendingLabel={<><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Correct Tag</>}
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        Correct Tag
      </PhotoSubmitButton>
      {state.status === 'error' && state.message && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </form>
  )
}
