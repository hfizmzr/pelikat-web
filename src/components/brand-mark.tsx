import Link from 'next/link'
import { cn } from '@/lib/utils'

/** The Pelikat mark: a flat "P" tile in the brand teal, next to the wordmark. */
export function BrandMark({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-lg bg-primary text-[14px] font-medium text-primary-foreground"
      >
        P
      </span>
      {wordmark && <span className="text-[16px] font-medium text-foreground">Pelikat</span>}
    </span>
  )
}

/**
 * The mark as a link. Public pages point it at `/`; signed-in areas point it
 * at the role's dashboard (`/organizer`, `/admin`).
 */
export function BrandLink({
  href = '/',
  label = 'Pelikat home',
  className,
  wordmark,
}: {
  href?: string
  label?: string
  className?: string
  wordmark?: boolean
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <BrandMark wordmark={wordmark} />
    </Link>
  )
}
