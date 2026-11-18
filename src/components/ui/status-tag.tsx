import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'warning' | 'destructive' | 'primary' | 'neutral'

const DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  primary: 'bg-primary',
  neutral: 'bg-muted-foreground',
}

// Common statuses across events, registrations, orders and organizers.
const TONE_FOR: Record<string, StatusTone> = {
  published: 'success',
  active: 'success',
  paid: 'success',
  waived: 'success',
  approved: 'success',
  completed: 'success',
  collected: 'success',
  healthy: 'success',
  pending: 'warning',
  review: 'warning',
  pending_review: 'warning',
  processing: 'warning',
  expiring: 'warning',
  degraded: 'warning',
  draft: 'neutral',
  closed: 'neutral',
  inactive: 'neutral',
  expired: 'neutral',
  cancelled: 'destructive',
  rejected: 'destructive',
  failed: 'destructive',
  refunded: 'destructive',
  suspended: 'destructive',
  unhealthy: 'destructive',
}

export function toneFor(status: string | null | undefined): StatusTone {
  return TONE_FOR[(status ?? '').toLowerCase()] ?? 'neutral'
}

/** "pending_review" → "Pending review" */
export function statusLabel(status: string | null | undefined): string {
  const s = (status ?? '').replace(/[_-]+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '—'
}

/** Registration roles: "vip" → "VIP", "pacer" → "Pacer" */
export function roleLabel(role: string | null | undefined): string {
  return (role ?? '').toLowerCase() === 'vip' ? 'VIP' : statusLabel(role)
}

/** Quiet status: a coloured dot and sentence-case text on a neutral surface. */
export function StatusTag({
  status,
  tone,
  children,
  className,
}: {
  status?: string | null
  tone?: StatusTone
  children?: React.ReactNode
  className?: string
}) {
  const t = tone ?? toneFor(status)
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-muted px-2 text-[12px] text-foreground',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT[t])} aria-hidden="true" />
      {children ?? statusLabel(status)}
    </span>
  )
}
