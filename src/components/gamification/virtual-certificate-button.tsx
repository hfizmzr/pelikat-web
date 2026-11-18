'use client'

import { Award } from 'lucide-react'
import { generateVirtualEventCertificate } from '@/lib/actions/cert'
import { CertDownloadButton } from '@/components/gamification/cert-download-button'

export function VirtualCertificateButton({ eventId }: { eventId: string }) {
  return (
    <CertDownloadButton
      action={generateVirtualEventCertificate}
      input={{ eventId }}
      label="Download e-certificate"
      pendingLabel="Download e-certificate"
      icon={<Award className="size-[18px]" />}
      iconClassName="size-[18px]"
      buttonClassName="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
      linkClassName="text-[12px] text-primary text-center underline"
      errorClassName="text-[11px] text-destructive text-center"
      wrapperClassName="flex flex-col gap-2"
    />
  )
}
