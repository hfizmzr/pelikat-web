'use client'

import { CheckCircle, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  confirmReviewPhoto,
  discardReviewPhoto,
  type ReviewPhotoActionState,
} from '@/components/events/actions'
import { PhotoSubmitButton, usePhotoAction } from '@/components/events/photo-action'

interface PhotoReviewActionsProps {
  eventId: string
  photoTagId: string
  storagePath: string
  detectedBib: string | null
}

export function PhotoReviewActions({
  eventId,
  photoTagId,
  storagePath,
  detectedBib,
}: PhotoReviewActionsProps) {
  const [confirmState, confirmAction] = usePhotoAction(confirmReviewPhoto)
  const [discardState, discardAction] = usePhotoAction(discardReviewPhoto)
  const latestState: ReviewPhotoActionState =
    confirmState.status !== 'idle' ? confirmState : discardState

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <form action={confirmAction} className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="photoTagId" value={photoTagId} />
          <input type="hidden" name="storagePath" value={storagePath} />
          <div className="space-y-1.5">
            <Label htmlFor={`bib-${photoTagId}`} className="sr-only">
              Confirm or correct BIB
            </Label>
            <Input
              id={`bib-${photoTagId}`}
              name="bibNumber"
              defaultValue={detectedBib ?? ''}
              placeholder="Enter BIB"
              className="h-9"
            />
          </div>
          <PhotoSubmitButton>
            <CheckCircle className="h-4 w-4" />
            Confirm
          </PhotoSubmitButton>
        </form>

        <form action={discardAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="photoTagId" value={photoTagId} />
          <input type="hidden" name="storagePath" value={storagePath} />
          <PhotoSubmitButton variant="outline">
            <Trash2 className="h-4 w-4" />
            Reject
          </PhotoSubmitButton>
        </form>
      </div>

      {latestState.message && (
        <p
          className={
            latestState.status === 'error'
              ? 'text-xs text-destructive'
              : 'text-xs text-green-500'
          }
        >
          {latestState.message}
        </p>
      )}
    </div>
  )
}
