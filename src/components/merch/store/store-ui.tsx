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
    <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
      <div className="flex items-center h-14 px-4 pt-safe gap-1">
        <Link
          href={backHref}
          aria-label="Back"
          className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </Link>
        <div className="flex-1 flex flex-col items-center min-w-0">
          <h1 className="text-[16px] font-bold text-[#e5e1e4] leading-tight truncate max-w-full">{title}</h1>
          {subtitle && <span className="text-[11px] text-[#958ea0] truncate max-w-full">{subtitle}</span>}
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
    <div className={`overflow-hidden bg-[#23232b] flex items-center justify-center text-[#958ea0] ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="material-symbols-outlined text-[28px]">checkroom</span>
      )}
    </div>
  )
}

export function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'info' | 'warn' | 'error' | 'success'
  icon: string
  children: React.ReactNode
}) {
  const tones = {
    info: 'bg-[#4cd7f6]/10 border-[#4cd7f6]/25 text-[#4cd7f6]',
    warn: 'bg-[#ffb86b]/10 border-[#ffb86b]/25 text-[#ffb86b]',
    error: 'bg-[#ffb4ab]/10 border-[#ffb4ab]/25 text-[#ffb4ab]',
    success: 'bg-[#4edea3]/10 border-[#4edea3]/25 text-[#4edea3]',
  }
  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-[12px] leading-[18px] ${tones[tone]}`}>
      <span className="material-symbols-outlined text-[18px] shrink-0">{icon}</span>
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
