'use client'

import { Button } from '@/components/ui/button'
import { Download, Share2 } from 'lucide-react'

export function BibActionButtons({ bibNumber, eventName }: { bibNumber: string; eventName: string }) {
  const handleSave = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 240
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#888888'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('BIB NUMBER', canvas.width / 2, 40)

    ctx.fillStyle = '#000000'
    ctx.font = 'bold 48px monospace'
    ctx.fillText(bibNumber, canvas.width / 2, 110)

    ctx.fillStyle = '#333333'
    ctx.font = '18px system-ui'
    ctx.fillText(eventName, canvas.width / 2, 150)

    const link = document.createElement('a')
    link.download = `BIB-${bibNumber}-${eventName.replace(/\s+/g, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `BIB ${bibNumber} - ${eventName}`,
          text: `Check out my digital BIB ${bibNumber} for ${eventName}!`,
          url: window.location.href,
        })
      } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.href)
      alert('Link copied to clipboard!')
    }
  }

  return (
    <div className="flex gap-2 w-full">
      <Button variant="outline" className="flex-1" onClick={handleSave}>
        <Download className="mr-2 h-4 w-4" />
        Save
      </Button>
      <Button variant="outline" className="flex-1" onClick={handleShare}>
        <Share2 className="mr-2 h-4 w-4" />
        Share
      </Button>
    </div>
  )
}
