'use client'

import { useState, useTransition } from 'react'
import { generateBadgeCertificate } from '@/lib/actions/cert'

export interface BadgeCertificate {
  runnerId: string
  badgeKey: string
  eventId?: string | null
  badgeName: string
}

export function BadgeCertificateButton({ badge }: { badge: BadgeCertificate }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  const handleDownload = () => {
    setError(null)
    setFallbackUrl(null)
    // Popup must open synchronously in the click handler — an async
    // window.open after a server action is blocked by browsers.
    const win = window.open('', '_blank')
    if (win) {
      // Defensive: _blank implies noopener, but null it in case the browser
      // keeps a reference back to this page.
      win.opener = null
    }
    startTransition(async () => {
      try {
        const url = await generateBadgeCertificate(badge)
        if (win) {
          win.location.href = url
        } else {
          // Popup blocked: expose the URL as a link instead.
          setFallbackUrl(url)
        }
      } catch (e) {
        if (win) win.close()
        setError(e instanceof Error ? e.message : 'Certificate failed')
      }
    })
  }

  return (
    <div className="flex flex-col">
      <button
        onClick={handleDownload}
        disabled={isPending}
        className="py-1.5 rounded-md bg-[#d0bcff]/15 text-[#d0bcff] text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[12px]">
          {isPending ? 'progress_activity' : 'download'}
        </span>
        {isPending ? 'Generating…' : 'Download Certificate'}
      </button>
      {fallbackUrl && (
        <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#d0bcff] mt-1 text-center underline">
          Open certificate
        </a>
      )}
      {error && (
        <p className="text-[9px] text-[#ffb4ab] mt-1 text-center">{error}</p>
      )}
    </div>
  )
}
