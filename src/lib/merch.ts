import { CircleCheck, CircleCheckBig, CircleX, Hourglass, Store, type LucideIcon } from "lucide-react"
export const MERCH_IMAGE_BUCKET = 'merch-images'

export const MERCH_SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

export const MERCH_ORDER_STATUSES = ['pending', 'confirmed', 'ready', 'collected', 'cancelled'] as const

export type MerchOrderStatus = (typeof MERCH_ORDER_STATUSES)[number]

export const MERCH_ORDER_STATUS_META: Record<
  MerchOrderStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Pending', className: 'text-muted-foreground bg-accent border-border' },
  confirmed: { label: 'Confirmed', className: 'text-primary bg-primary/10 border-primary/20' },
  ready: { label: 'Ready', className: 'text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' },
  collected: { label: 'Collected', className: 'text-success bg-success/15 border-success/20' },
  cancelled: { label: 'Cancelled', className: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/10 border-red-500/20 dark:border-red-300/20' },
}

// Orders in these states count as sold (matches the merch_product_sales view)
export const MERCH_SOLD_STATUSES: MerchOrderStatus[] = ['confirmed', 'ready', 'collected']

// Organizer status changes accepted by merch_update_order_status()
export const MERCH_STATUS_TRANSITIONS: Record<MerchOrderStatus, MerchOrderStatus[]> = {
  pending: ['cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['collected', 'confirmed', 'cancelled'],
  collected: ['ready'],
  cancelled: [],
}

export type MerchVariant = {
  id: string
  size: string | null
  color: string | null
  stock: number
}

export type MerchProduct = {
  id: string
  event_id: string
  name: string
  description: string | null
  price: number
  is_active: boolean
  image_path: string | null
  low_stock_threshold: number
  merch_variants: MerchVariant[]
}

export type MerchOrderItem = {
  quantity: number
  unit_price: number
  merch_variants: {
    size: string | null
    color: string | null
    merch_products: { name: string } | null
  } | null
}

export type MerchOrder = {
  id: string
  order_number: string
  status: MerchOrderStatus
  total_amount: number
  created_at: string
  ready_at: string | null
  collected_at: string | null
  runner_id: string | null
  runner_profiles: { full_name: string | null; phone: string | null } | null
  merch_order_items: MerchOrderItem[]
}

export type MerchProductSales = {
  product_id: string
  name: string
  items_sold: number
  revenue: number
}

export function variantLabel(variant: { size: string | null; color: string | null }) {
  return [variant.size, variant.color].filter(Boolean).join(' / ') || 'One size'
}

export type StockLevel = 'out' | 'low' | 'ok'

export function stockLevel(stock: number, threshold: number): StockLevel {
  if (stock <= 0) return 'out'
  if (stock <= threshold) return 'low'
  return 'ok'
}

export function formatRM(value: number) {
  return `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Canonical sort order for merch variant sizes (superset incl. 2XL).
const MERCH_SIZE_SORT_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL']

/** Sort merch variants by size order, then size+color text. */
export function compareVariants(
  a: { size: string | null; color: string | null },
  b: { size: string | null; color: string | null }
) {
  const ai = MERCH_SIZE_SORT_ORDER.indexOf((a.size ?? '').toUpperCase())
  const bi = MERCH_SIZE_SORT_ORDER.indexOf((b.size ?? '').toUpperCase())
  if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  return `${a.size ?? ''}${a.color ?? ''}`.localeCompare(`${b.size ?? ''}${b.color ?? ''}`)
}

export function merchImageUrl(path: string | null) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MERCH_IMAGE_BUCKET}/${path}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner store (FR-69 … FR-73)
// ─────────────────────────────────────────────────────────────────────────────

// Stock is held this long for an unpaid order (matches merch_checkout())
export const MERCH_RESERVATION_MINUTES = 15
export const MERCH_MAX_QTY_PER_ITEM = 10

export type MerchPaymentMethod = 'fpx' | 'card'

export const MERCH_PAYMENT_METHOD_LABEL: Record<MerchPaymentMethod, string> = {
  fpx: 'FPX Online Banking',
  card: 'Credit / Debit Card',
}

// Runner-facing wording for each status (FR-73)
export const MERCH_RUNNER_STATUS_META: Record<
  MerchOrderStatus,
  { label: string; description: string; icon: LucideIcon }
> = {
  pending: {
    label: 'Awaiting payment',
    description: 'Complete payment before your reservation expires.',
    icon: Hourglass,
  },
  confirmed: {
    label: 'Confirmed',
    description: 'Payment received. The organizer is packing your order.',
    icon: CircleCheckBig,
  },
  ready: {
    label: 'Ready to collect',
    description: 'Collect it at REPC — show your Digital BIB QR at the counter.',
    icon: Store,
  },
  collected: {
    label: 'Collected',
    description: 'Picked up at REPC. Enjoy your gear!',
    icon: CircleCheck,
  },
  cancelled: {
    label: 'Cancelled',
    description: 'This order was cancelled.',
    icon: CircleX,
  },
}

export const MERCH_CANCEL_REASON_LABEL: Record<string, string> = {
  expired: 'Payment was not completed within the reservation time.',
  replaced: 'Replaced by a newer checkout for the same event.',
  cancelled_by_runner: 'You cancelled this checkout.',
  cancelled_by_organizer: 'Cancelled by the organizer. Contact them about refunds.',
}

export type MerchCartLine = {
  variantId: string
  productId: string
  name: string
  variantLabel: string
  price: number
  imagePath: string | null
  quantity: number
}

export type RunnerMerchOrderItem = {
  id: string
  quantity: number
  unit_price: number
  product_name: string | null
  variant_label: string | null
}

export type RunnerMerchOrder = {
  id: string
  order_number: string
  status: MerchOrderStatus
  total_amount: number
  created_at: string
  expires_at: string | null
  paid_at: string | null
  ready_at: string | null
  collected_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  payment_method: MerchPaymentMethod | null
  payment_ref: string | null
  event_id: string
  events: { id: string; name: string; event_date: string; location: string | null } | null
  merch_order_items: RunnerMerchOrderItem[]
}

export const RUNNER_MERCH_ORDER_SELECT =
  'id, order_number, status, total_amount, created_at, expires_at, paid_at, ready_at, collected_at, cancelled_at, cancel_reason, payment_method, payment_ref, event_id, events(id, name, event_date, location), merch_order_items(id, quantity, unit_price, product_name, variant_label)'

export function orderItemCount(order: { merch_order_items: { quantity: number }[] }) {
  return order.merch_order_items.reduce((sum, item) => sum + item.quantity, 0)
}
