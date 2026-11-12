'use client'
import { Download, Share2 } from "lucide-react"
import { toast } from 'sonner'

/** P4 smoke carry: the download filename prefix is the RESOLVED bib label,
 * slugified — lowercase, non-alnum folded to '-', trimmed; empty/unset →
 * the platform 'BIB'. Never throws non-alnum bytes into the filename. */
export function bibFilePrefix(bibLabel?: string): string {
  const slug = (bibLabel ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'BIB'
}

export function BibActionButtons({
  bibNumber,
  eventName,
  bibLabel,
}: {
  bibNumber: string
  eventName: string
  /** Themed vocabulary threaded from the server bib page (P3 Task 4) — the
   * canvas-share copy uses it; absent → the platform 'BIB' copy, so this served
   * prop keeps the component usable anywhere. No client-side theme fetch. */
  bibLabel?: string
}) {
  const handleSave = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 240
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#18181b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText((bibLabel ?? 'BIB NUMBER').toUpperCase(), canvas.width / 2, 40)

    ctx.fillStyle = '#f8fafc'
    ctx.font = 'bold 48px monospace'
    ctx.fillText(bibNumber, canvas.width / 2, 110)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '18px system-ui'
    ctx.fillText(eventName, canvas.width / 2, 150)

    const link = document.createElement('a')
    // P4 smoke carry: the filename prefix is the RESOLVED bib label, slugified
    // (lowercase, non-alnum → '-', trimmed); empty/unset → the platform 'BIB'.
    link.download = `${bibFilePrefix(bibLabel)}-${bibNumber}-${eventName.replace(/\s+/g, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // Clipboard copy with a legacy fallback: navigator.clipboard is rejected in
  // insecure contexts / without permission (writeText → NotAllowedError), so
  // fall back to a hidden textarea + execCommand before giving up.
  const copyLink = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard!')
      return
    } catch {
      // fall through to the legacy path
    }
    try {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
      toast.success('Link copied to clipboard!')
    } catch {
      toast.error('Could not copy the link — share it from the address bar instead.')
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${bibLabel ?? 'BIB'} ${bibNumber} - ${eventName}`,
          text: `Check out my digital ${bibLabel ?? 'BIB'} ${bibNumber} for ${eventName}!`,
          url: window.location.href,
        })
        return
      } catch (err) {
        // User cancelled the share sheet — treat as done. Any other failure
        // (permission denied, etc.) falls back to clipboard copy below.
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    await copyLink()
  }

  return (
    <div className="flex w-full gap-2 mt-4">
      <button 
        onClick={handleSave}
        className="flex-1 py-3 rounded-xl bg-accent text-foreground text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <Download className="size-[18px]" />
        Save Image
      </button>
      <button 
        onClick={handleShare}
        className="flex-1 py-3 rounded-xl bg-accent text-foreground text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <Share2 className="size-[18px]" />
        Share
      </button>
    </div>
  )
}
