'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Check, Download, Flag, Loader2, Share2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  requestRunnerPhotoReview,
  type ReviewPhotoActionState,
} from '@/components/events/actions'

interface RunnerPhotoActionsProps {
  imageUrl: string | null
  fileName: string
  eventId?: string
  photoTagId?: string
}

const initialReviewState: ReviewPhotoActionState = { status: 'idle' }

function ReviewSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
      Send to review
    </Button>
  )
}

export function RunnerPhotoActions({
  imageUrl,
  fileName,
  eventId,
  photoTagId,
}: RunnerPhotoActionsProps) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'error'>('idle')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [reviewState, reviewAction] = useActionState(requestRunnerPhotoReview, initialReviewState)

  useEffect(() => {
    if (reviewState.status === 'success') {
      router.refresh()
    }
  }, [reviewState.status, router])

  const resetFeedback = () => {
    window.setTimeout(() => setFeedback('idle'), 1500)
  }

  const fetchPhotoBlob = async () => {
    if (!imageUrl) throw new Error('Photo is not available yet.')

    const response = await fetch(imageUrl)

    if (!response.ok) {
      throw new Error('Could not load photo.')
    }

    return response.blob()
  }

  const handleDownload = async () => {
    if (!imageUrl || isDownloading) return

    setIsDownloading(true)
    setFeedback('idle')

    try {
      const blob = await fetchPhotoBlob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = blobUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)

      setFeedback('success')
    } catch {
      setFeedback('error')
    } finally {
      setIsDownloading(false)
      resetFeedback()
    }
  }

  const handleShare = async () => {
    if (!imageUrl || isSharing) return

    setIsSharing(true)
    setFeedback('idle')

    try {
      const blob = await fetchPhotoBlob()
      const file = new File([blob], fileName, {
        type: blob.type || 'image/jpeg',
      })

      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({
          title: fileName,
          files: [file],
        })
      } else if (navigator.share) {
        await navigator.share({
          title: fileName,
          url: imageUrl,
        })
      } else {
        await navigator.clipboard.writeText(imageUrl)
      }

      setFeedback('success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setFeedback('idle')
      } else {
        setFeedback('error')
      }
    } finally {
      setIsSharing(false)
      resetFeedback()
    }
  }

  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-8 w-8 bg-background/90 shadow-sm"
        disabled={!imageUrl || isDownloading}
        onClick={handleDownload}
        aria-label="Download photo"
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-8 w-8 bg-background/90 shadow-sm"
        disabled={!imageUrl || isSharing}
        onClick={handleShare}
        aria-label="Share photo"
      >
        {isSharing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : feedback === 'success' ? (
          <Check className="h-4 w-4" />
        ) : feedback === 'error' ? (
          <X className="h-4 w-4" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
      </Button>
      {eventId && photoTagId && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-background/90 shadow-sm"
              aria-label="Send photo back to organizer review"
              title="Not me? Send back to organizer review"
            >
              <Flag className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form action={reviewAction}>
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="photoTagId" value={photoTagId} />
              <AlertDialogHeader>
                <AlertDialogTitle>Send this photo back to review?</AlertDialogTitle>
                <AlertDialogDescription>
                  Use this if the photo is not you or the BIB was mislabeled. It will disappear from your gallery and return to the organizer review queue.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {reviewState.status === 'error' && reviewState.message && (
                <p className="mt-3 text-sm text-destructive">{reviewState.message}</p>
              )}
              <AlertDialogFooter className="mt-4">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <ReviewSubmitButton />
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
