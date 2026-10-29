'use client'

/**
 * Copy Public Event Link (P3 Task 5, plan §13) — organizer dashboard affordance
 * for the shareable /events/[slug] public page. The server page computes the
 * URL (NEXT_PUBLIC_APP_URL fallback chain) and only renders this button when
 * the event carries a slug — drafts (slug NULL) never get the button here,
 * because the public route doesn't serve them anyway.
 *
 * Clipboard handling follows the bib-action-buttons precedent (writeText +
 * transient copied state); a clipboard failure (e.g. insecure origin) simply
 * leaves the button un-copied — no error UI contract exists for this affordance.
 */
import { useEffect, useRef, useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CopyPublicEventLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  // P4 audit nit: the "copied" revert timeout must not outlive the component —
  // capture the id and clear it on unmount (bib-action-buttons precedent).
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (copiedTimeout.current !== null) clearTimeout(copiedTimeout.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (copiedTimeout.current !== null) clearTimeout(copiedTimeout.current)
      copiedTimeout.current = setTimeout(() => setCopied(false), 1500) // bib consent-page precedent
    } catch {
      // clipboard unavailable/blocked — the copied state simply never latches
    }
  }

  return (
    // no fixed aria-label: it would freeze the accessible name while the
    // visible text swaps to "Link Copied" — the polite live region announces
    // the change instead (CodeRabbit uncommitted review).
    <Button variant="outline" onClick={handleCopy} aria-live="polite">
      <Link2 className="mr-2 h-4 w-4" />
      {copied ? 'Link Copied' : 'Copy Public Event Link'}
    </Button>
  )
}
