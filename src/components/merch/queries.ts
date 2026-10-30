import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderRow } from '@/components/merch/order-table'
import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
import {
  MERCH_SOLD_STATUSES,
  compareVariants,
  variantLabel,
  type MerchOrder,
  type MerchProduct,
  type MerchProductSales,
} from '@/lib/merch'

export type MerchEventOption = {
  id: string
  name: string
  event_date: string
  status: string | null
}

export async function getOrganizerMerchEvents(supabase: SupabaseClient, organizerId: string) {
  const { data } = await supabase
    .from('events')
    .select('id, name, event_date, status')
    .eq('organizer_id', organizerId)
    .order('event_date', { ascending: false })

  return (data ?? []) as MerchEventOption[]
}

// Default to the next upcoming published event, else the most recent one
export function pickDefaultEvent(events: MerchEventOption[], requestedId?: string) {
  if (requestedId) {
    const requested = events.find((e) => e.id === requestedId)
    if (requested) return requested
  }
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = events
    .filter((e) => e.status === 'published' && e.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
  return upcoming[0] ?? events[0] ?? null
}

export async function getMerchHubData(supabase: SupabaseClient, eventId: string) {
  const [productsRes, ordersRes, salesRes, registrationsRes] = await Promise.all([
    supabase
      .from('merch_products')
      .select(
        'id, event_id, name, description, price, is_active, image_path, low_stock_threshold, merch_variants(id, size, color, stock)'
      )
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
    supabase
      .from('merch_orders')
      .select(
        'id, order_number, status, total_amount, created_at, ready_at, collected_at, runner_id, merch_order_items(quantity, unit_price, merch_variants(size, color, merch_products(name)))'
      )
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
    supabase
      .from('merch_product_sales')
      .select('product_id, name, items_sold, revenue')
      .eq('event_id', eventId),
    supabase.from('registrations').select('runner_id, bib_number').eq('event_id', eventId),
  ])

  const products = ((productsRes.data ?? []) as unknown as MerchProduct[]).map((p) => ({
    ...p,
    price: Number(p.price),
    merch_variants: [...(p.merch_variants ?? [])].sort(compareVariants),
  }))

  const bibByRunner = new Map(
    (registrationsRes.data ?? []).map((r: { runner_id: string | null; bib_number: string | null }) => [
      r.runner_id,
      r.bib_number,
    ])
  )

  // Re-attach runner names via the organizer-safe view (raw
  // runner_profiles rows / embeds are no longer organizer-readable)
  const profileById = await getSafeRunnerProfiles(
    supabase,
    ((ordersRes.data ?? []) as { runner_id: string | null }[]).map(o => o.runner_id),
  )

  const rawOrders = ((ordersRes.data ?? []) as unknown as MerchOrder[]).map((o) => ({
    ...o,
    runner_profiles: profileById.get(o.runner_id ?? '') ?? null,
  }))
  const orders: OrderRow[] = rawOrders.map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    total: Number(o.total_amount ?? 0),
    createdAt: o.created_at,
    runnerName: o.runner_profiles?.full_name || 'Unknown runner',
    bibNumber: (o.runner_id && bibByRunner.get(o.runner_id)) || null,
    items: (o.merch_order_items ?? []).map((item) => ({
      quantity: item.quantity,
      label: item.merch_variants
        ? `${item.merch_variants.merch_products?.name ?? 'Item'} (${variantLabel(item.merch_variants)})`
        : 'Removed item',
    })),
  }))

  const sales = ((salesRes.data ?? []) as MerchProductSales[]).map((s) => ({
    ...s,
    items_sold: Number(s.items_sold),
    revenue: Number(s.revenue),
  }))

  const paidOrders = rawOrders.filter((o) => MERCH_SOLD_STATUSES.includes(o.status)).length
  const pendingOrders = rawOrders.filter((o) => o.status === 'pending').length

  const error = productsRes.error ?? ordersRes.error ?? salesRes.error ?? null

  return { products, orders, sales, paidOrders, pendingOrders, error }
}
