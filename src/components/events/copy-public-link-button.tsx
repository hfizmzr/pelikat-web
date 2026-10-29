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
import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CopyPublicEventLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500) // bib consent-page precedent
    } catch {
      // clipboard unavailable/blocked — the copied state simply never latches
    }
  }

  return (
    <Button variant="outline" onClick={handleCopy}>
      <Link2 className="mr-2 h-4 w-4" />
      {copied ? 'Link Copied' : 'Copy Public Event Link'}
    </Button>
  )
}
