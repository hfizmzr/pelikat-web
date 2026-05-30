'use client'

import { useState } from 'react'
import { Check, Download, Loader2, Share2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RunnerPhotoActionsProps {
  imageUrl: string | null
  fileName: string
}

export function RunnerPhotoActions({ imageUrl, fileName }: RunnerPhotoActionsProps) {
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'error'>('idle')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

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
    </div>
  )
}
