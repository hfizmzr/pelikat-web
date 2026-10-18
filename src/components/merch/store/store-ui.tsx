import { ArrowLeft, Shirt, type LucideIcon } from "lucide-react"
import Link from 'next/link'
import {
  MERCH_ORDER_STATUS_META,
  MERCH_RUNNER_STATUS_META,
  merchImageUrl,
  type MerchOrderStatus,
} from '@/lib/merch'

export function StoreHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string
  subtitle?: string
  backHref: string
  action?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
      <div className="flex items-center h-14 px-4 pt-safe gap-1">
        <Link
          href={backHref}
          aria-label="Back"
          className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2"
        >
          <ArrowLeft className="size-[24px]" />
        </Link>
        <div className="flex-1 flex flex-col items-center min-w-0">
          <h1 className="text-[16px] font-bold text-foreground leading-tight truncate max-w-full">{title}</h1>
          {subtitle && <span className="text-[11px] text-muted-foreground truncate max-w-full">{subtitle}</span>}
        </div>
        <div className="w-10 h-10 -mr-2 flex items-center justify-center">{action}</div>
      </div>
    </header>
  )
}

export function OrderStatusChip({ status }: { status: MerchOrderStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${MERCH_ORDER_STATUS_META[status].className}`}
    >
      {MERCH_RUNNER_STATUS_META[status].label}
    </span>
  )
}

export function ProductThumb({
  imagePath,
  name,
  className = '',
}: {
  imagePath: string | null
  name: string
  className?: string
}) {
  const url = merchImageUrl(imagePath)
  return (
    <div className={`overflow-hidden bg-muted flex items-center justify-center text-muted-foreground ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Shirt className="size-[28px]" />
      )}
    </div>
  )
}

export function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warn' | 'error' | 'success'
  icon: LucideIcon
  children: React.ReactNode
}) {
  const tones = {
    info: 'bg-primary/10 border-primary/25 text-primary',
    warn: 'bg-amber-500/10 dark:bg-amber-400/10 border-amber-500/25 dark:border-amber-400/25 text-amber-500 dark:text-amber-400',
    error: 'bg-red-500/10 dark:bg-red-300/10 border-red-500/25 dark:border-red-300/25 text-red-500 dark:text-red-300',
    success: 'bg-success/10 border-success/25 text-success',
  }
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-[12px] leading-[18px] ${tones[tone]}`}>
      <Icon className="size-[18px] shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function formatOrderDate(value: string) {
  return new Date(value).toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
