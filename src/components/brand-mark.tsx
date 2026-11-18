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
