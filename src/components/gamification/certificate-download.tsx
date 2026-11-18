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
          text: `I earned the ${badge.badgeName} badge on Pelikat`,
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
        setShareLabel('Link copied')
        setTimeout(() => setShareLabel(null), 2000)
      } catch {
        // clipboard denied → stay silent, no crash
      }
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <CertDownloadButton
        action={generateBadgeCertificate}
        input={badge}
        label="Download certificate"
        icon={<Download className="size-3.5" strokeWidth={1.75} />}
        iconClassName="size-3.5"
        buttonClassName="w-full min-h-9 rounded-lg border border-border/60 text-foreground text-[12px] flex items-center justify-center gap-1.5 transition-[background-color,transform] hover:bg-accent active:scale-[0.98] disabled:opacity-50"
        linkClassName="text-[12px] text-foreground mt-1 text-center underline underline-offset-4"
        errorClassName="text-[12px] text-destructive mt-1 text-center"
      />
      <button
        onClick={handleShare}
        className="min-h-9 rounded-lg text-muted-foreground text-[12px] flex items-center justify-center gap-1.5 transition-[color,transform] hover:text-foreground active:scale-[0.98]"
      >
        <Share2 className="size-3.5" strokeWidth={1.75} />
        {shareLabel ?? 'Share'}
      </button>
    </div>
  )
}
