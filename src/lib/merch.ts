export const MERCH_IMAGE_BUCKET = 'merch-images'

export const MERCH_SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

export const MERCH_ORDER_STATUSES = ['pending', 'confirmed', 'ready', 'collected', 'cancelled'] as const

export type MerchOrderStatus = (typeof MERCH_ORDER_STATUSES)[number]

export const MERCH_ORDER_STATUS_META: Record<
  MerchOrderStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Pending', className: 'text-[#cbc3d7] bg-[#353437] border-[#494454]' },
  confirmed: { label: 'Confirmed', className: 'text-[#4cd7f6] bg-[#4cd7f6]/10 border-[#4cd7f6]/20' },
  ready: { label: 'Ready', className: 'text-[#d0bcff] bg-[#d0bcff]/10 border-[#d0bcff]/20' },
  collected: { label: 'Collected', className: 'text-[#4edea3] bg-[#4edea3]/15 border-[#4edea3]/20' },
  cancelled: { label: 'Cancelled', className: 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20' },
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

export function merchImageUrl(path: string | null) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MERCH_IMAGE_BUCKET}/${path}`
}
