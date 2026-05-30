'use client'

import { useActionState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  confirmReviewPhoto,
  discardReviewPhoto,
  type ReviewPhotoActionState,
} from '@/components/events/actions'

const initialState: ReviewPhotoActionState = { status: 'idle' }

function SubmitButton({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: 'default' | 'outline' | 'destructive'
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </Button>
  )
}

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
  const router = useRouter()
  const [confirmState, confirmAction] = useActionState(confirmReviewPhoto, initialState)
  const [discardState, discardAction] = useActionState(discardReviewPhoto, initialState)
  const latestState = confirmState.status !== 'idle' ? confirmState : discardState

  useEffect(() => {
    if (latestState.status === 'success') {
      router.refresh()
    }
  }, [latestState.status, router])

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
          <SubmitButton>
            <CheckCircle className="h-4 w-4" />
            Confirm
          </SubmitButton>
        </form>

        <form action={discardAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="photoTagId" value={photoTagId} />
          <input type="hidden" name="storagePath" value={storagePath} />
          <SubmitButton variant="outline">
            <Trash2 className="h-4 w-4" />
            Reject
          </SubmitButton>
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
