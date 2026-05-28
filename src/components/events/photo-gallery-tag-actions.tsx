'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  movePhotoTagToReview,
  type ReviewPhotoActionState,
} from '@/components/events/actions'

const initialState: ReviewPhotoActionState = { status: 'idle' }

function CorrectTagButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      size="sm"
      variant="outline"
      disabled={pending}
      className="h-7 bg-background/85 text-xs"
    >
      {pending ? (
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
      )}
      Correct Tag
    </Button>
  )
}

interface PhotoGalleryTagActionsProps {
  eventId: string
  photoTagId: string
}

export function PhotoGalleryTagActions({
  eventId,
  photoTagId,
}: PhotoGalleryTagActionsProps) {
  const router = useRouter()
  const [state, formAction] = useActionState(movePhotoTagToReview, initialState)

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh()
    }
  }, [router, state.status])

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="photoTagId" value={photoTagId} />
      <CorrectTagButton />
      {state.status === 'error' && state.message && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </form>
  )
}
