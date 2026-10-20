'use client'

import { useState, useTransition } from 'react'
import { Award, LoaderCircle } from 'lucide-react'
import { generateVirtualEventCertificate } from '@/lib/actions/cert'

export function VirtualCertificateButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  const handleDownload = () => {
    setError(null)
    setUrl(null)
    // Popup must open synchronously in the click handler — an async
    // window.open after a server action is blocked by browsers.
    const win = window.open('', '_blank')
    if (win) win.opener = null
    startTransition(async () => {
      try {
        const certUrl = await generateVirtualEventCertificate({ eventId })
        if (win) win.location.href = certUrl
        else setUrl(certUrl)
      } catch (e) {
        if (win) win.close()
        setError(e instanceof Error ? e.message : 'Certificate failed')
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleDownload}
        disabled={isPending}
        className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
      >
        {isPending ? (
          <LoaderCircle className="size-[18px] animate-spin" />
        ) : (
          <Award className="size-[18px]" />
        )}
        Download E-Certificate
      </button>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-primary text-center underline">
          Open certificate
        </a>
      )}
      {error && (
        <p className="text-[11px] text-red-500 dark:text-red-300 text-center">{error}</p>
      )}
    </div>
  )
}
