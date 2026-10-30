'use client'

import { Download } from 'lucide-react'
import { generateBadgeCertificate } from '@/lib/actions/cert'
import { CertDownloadButton } from '@/components/gamification/cert-download-button'

export interface BadgeCertificate {
  runnerId: string
  badgeKey: string
  eventId?: string | null
  badgeName: string
}

export function BadgeCertificateButton({ badge }: { badge: BadgeCertificate }) {
  return (
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
  )
}
