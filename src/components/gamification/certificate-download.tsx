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

  const handleDownload = () => {
    setError(null)
    startTransition(async () => {
      try {
        const url = await generateBadgeCertificate(badge)
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch (e) {
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
      {error && (
        <p className="text-[9px] text-[#ffb4ab] mt-1 text-center">{error}</p>
      )}
    </div>
  )
}
