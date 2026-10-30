'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle } from 'lucide-react'

/**
 * Shared download flow for server-action certificates: open a popup
 * synchronously in the click handler (browsers block async window.open
 * after a server action), navigate it to the generated URL, and expose a
 * plain link + message on popup-block/error. Styling differs between the
 * compact badge-card button and the runner-event page button.
 */
export function CertDownloadButton<T>({
  action,
  input,
  label,
  pendingLabel,
  icon,
  iconClassName,
  buttonClassName,
  linkClassName,
  errorClassName,
  wrapperClassName,
}: {
  action: (input: T) => Promise<string>
  input: T
  label: string
  pendingLabel?: React.ReactNode
  /** Idle-state icon; its size classes also size the pending spinner. */
  icon: React.ReactNode
  iconClassName: string
  buttonClassName: string
  linkClassName: string
  errorClassName: string
  wrapperClassName?: string
}) {
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
        const url = await action(input)
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
    <div className={wrapperClassName}>
      <button onClick={handleDownload} disabled={isPending} className={buttonClassName}>
        {isPending ? <LoaderCircle className={`${iconClassName} animate-spin`} /> : icon}
        {isPending ? pendingLabel ?? 'Generating…' : label}
      </button>
      {fallbackUrl && (
        <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          Open certificate
        </a>
      )}
      {error && <p className={errorClassName}>{error}</p>}
    </div>
  )
}
