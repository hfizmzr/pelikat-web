'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Standard aspect-ratio values per themed asset kind (spec §6 assets).
 * Consumers pick from this map; the component itself accepts any free-form
 * CSS `aspect-ratio` value. */
export const THEME_ASPECTS = {
  banner: '3/1',
  logo: '1/1',
  badge: '1/1',
  certificate_background: '1.414/1',
} as const

/**
 * ThemedImage — reserved-box themed asset (spec §6): the wrapper ALWAYS
 * occupies layout via `aspectRatio`, so an empty or broken `src` causes zero
 * CLS and never renders a broken-image glyph. Broken/missing src swaps the
 * box content to a platform-neutral gradient fallback (no platform token
 * remap — plain `bg-muted`-family classes). `alt` stays accessible as a
 * visually-hidden span in BOTH states. Used by editor thumbnails + runner
 * hero (tasks 7/9).
 */
export function ThemedImage({
  src,
  alt,
  aspect,
  className,
  fallbackClassName,
}: {
  src?: string
  alt: string
  aspect: string
  className?: string
  fallbackClassName?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showFallback = !src || src === failedSrc
  return (
    <div className="overflow-hidden" style={{ aspectRatio: aspect }}>
      {showFallback ? (
        <>
          <span className="sr-only">{alt}</span>
          <div
            aria-hidden="true"
            className={cn(
              'h-full w-full bg-gradient-to-br from-muted to-background',
              fallbackClassName
            )}
          />
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- reserved-box: arbitrary storage URLs of no intrinsic size; next/image would fight the locked aspect box
        <img
          src={src}
          alt={alt}
          className={cn('h-full w-full object-cover', className)}
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      )}
    </div>
  )
}
