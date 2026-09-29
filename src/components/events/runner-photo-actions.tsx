'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
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

function ReviewSubmitButton({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus()

  return (
    <div className="flex gap-2 w-full mt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="flex-1 py-3 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold active:scale-95 transition-transform"
      >
        Cancel
      </button>
      <button 
        type="submit" 
        disabled={pending}
        className="flex-1 py-3 rounded-xl bg-[#ffb4ab] text-[#690005] text-[13px] font-bold active:scale-95 transition-transform flex justify-center items-center gap-2"
      >
        {pending ? (
          <>
            <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
            Sending...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[16px]">flag</span>
            Send to Review
          </>
        )}
      </button>
    </div>
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
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewState, reviewAction] = useActionState(requestRunnerPhotoReview, initialReviewState)

  useEffect(() => {
    if (reviewState.status === 'success') {
      setShowReviewModal(false)
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
        await navigator.share({ title: fileName, files: [file] })
      } else if (navigator.share) {
        await navigator.share({ title: fileName, url: imageUrl })
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
    <>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={!imageUrl || isDownloading}
          onClick={handleDownload}
          title="Download photo"
          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-[#e5e1e4] active:scale-95 transition-transform disabled:opacity-50"
        >
          {isDownloading ? (
            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-[16px]">download</span>
          )}
        </button>
        <button
          type="button"
          disabled={!imageUrl || isSharing}
          onClick={handleShare}
          title="Share photo"
          className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-[#e5e1e4] active:scale-95 transition-transform disabled:opacity-50"
        >
          {isSharing ? (
            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
          ) : feedback === 'success' ? (
            <span className="material-symbols-outlined text-[16px] text-[#4edea3]">check</span>
          ) : feedback === 'error' ? (
            <span className="material-symbols-outlined text-[16px] text-[#ffb4ab]">close</span>
          ) : (
            <span className="material-symbols-outlined text-[16px]">share</span>
          )}
        </button>
        {eventId && photoTagId && (
          <button
            type="button"
            onClick={() => setShowReviewModal(true)}
            title="Not me? Send back to organizer review"
            className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-[#ffb4ab] active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[16px]">flag</span>
          </button>
        )}
      </div>

      {/* Review Modal Overlay */}
      {showReviewModal && eventId && photoTagId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1c1b1d] border border-[#353437] rounded-2xl p-6 w-full max-w-sm flex flex-col">
            <h3 className="text-[18px] font-bold text-[#e5e1e4] mb-2">Send this photo back to review?</h3>
            <p className="text-[13px] text-[#958ea0] mb-4">
              Use this if the photo is not you or the BIB was mislabeled. It will disappear from your gallery and return to the organizer review queue.
            </p>
            
            <form action={reviewAction} className="flex flex-col">
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="photoTagId" value={photoTagId} />
              
              {reviewState.status === 'error' && reviewState.message && (
                <div className="p-3 mb-2 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {reviewState.message}
                </div>
              )}
              
              <ReviewSubmitButton onCancel={() => setShowReviewModal(false)} />
            </form>
          </div>
        </div>
      )}
    </>
  )
}
