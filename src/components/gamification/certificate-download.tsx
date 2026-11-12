'use client'

import { useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { generateBadgeCertificate } from '@/lib/actions/cert'
import { CertDownloadButton } from '@/components/gamification/cert-download-button'

export interface BadgeCertificate {
  runnerId: string
  badgeKey: string
  eventId?: string | null
  badgeName: string
}

export function BadgeCertificateButton({ badge }: { badge: BadgeCertificate }) {
  const [shareLabel, setShareLabel] = useState<string | null>(null)

  // FR-65: the cert URL returned by generateBadgeCertificate is a fresh
  // 24h signed link (cert.ts), so the honest share target is the durable
  // page-level permalink: the runner's badges page.
  const handleShare = async () => {
    const url = new URL('/runner/badges', window.location.origin).href
    let shared = false
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${badge.badgeName} - Pelikat`,
          text: `Check out my ${badge.badgeName} badge from Pelikat!`,
          url,
        })
        shared = true
      } catch {
        // share sheet failed/cancelled → fall through to clipboard
      }
    }
    if (!shared && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        setShareLabel('Link copied!')
        setTimeout(() => setShareLabel(null), 2000)
      } catch {
        // clipboard denied → stay silent, no crash
      }
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <CertDownloadButton
        action={generateBadgeCertificate}
        input={badge}
        label="Download Certificate"
        icon={<Download className="size-[12px]" />}
        iconClassName="size-[12px]"
        buttonClassName="py-1.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
        linkClassName="text-[10px] text-primary mt-1 text-center underline"
        errorClassName="text-[9px] text-red-500 dark:text-red-300 mt-1 text-center"
      />
      <button
        onClick={handleShare}
        className="py-1.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
      >
        <Share2 className="size-[12px]" />
        {shareLabel ?? 'Share'}
      </button>
    </div>
  )
}
