import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  RUNNER_MERCH_ORDER_SELECT,
  formatRM,
  orderItemCount,
  type RunnerMerchOrder,
} from '@/lib/merch'
import { malaysiaToday } from '@/components/merch/store/queries'
import { OrderStatusChip, StoreHeader, formatOrderDate } from '@/components/merch/store/store-ui'

export const metadata: Metadata = {
  title: 'Merchandise - Pelikat',
  description: 'Shop event merch and track your orders',
}

type ShopEvent = { id: string; name: string; event_date: string; productCount: number }

export default async function RunnerMerchPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('runner_profiles').select('id').eq('user_id', user.id).maybeSingle()
    : { data: null }

  // RLS limits products to events the runner is registered for, and orders to their own
  const [{ data: registrations }, { data: products }, { data: orderRows }] = profile
    ? await Promise.all([
        supabase
          .from('registrations')
          .select('event_id, events(id, name, event_date)')
          .eq('runner_id', profile.id),
        supabase.from('merch_products').select('event_id').eq('is_active', true),
        supabase
          .from('merch_orders')
          .select(RUNNER_MERCH_ORDER_SELECT)
          .eq('runner_id', profile.id)
          .order('created_at', { ascending: false }),
      ])
    : [{ data: null }, { data: null }, { data: null }]

  const productCounts = new Map<string, number>()
  for (const p of products ?? []) productCounts.set(p.event_id, (productCounts.get(p.event_id) ?? 0) + 1)

  const today = malaysiaToday()
  const shopEvents: ShopEvent[] = (registrations ?? [])
    .map((r) => r.events as unknown as { id: string; name: string; event_date: string } | null)
    .filter((e): e is NonNullable<typeof e> => !!e && e.event_date >= today && productCounts.has(e.id))
    .map((e) => ({ ...e, productCount: productCounts.get(e.id) ?? 0 }))
    .sort((a, b) => a.event_date.localeCompare(b.event_date))

  const orders = (orderRows ?? []) as unknown as RunnerMerchOrder[]
  const activeOrders = orders.filter((o) => ['pending', 'confirmed', 'ready'].includes(o.status))
  const pastOrders = orders.filter((o) => !['pending', 'confirmed', 'ready'].includes(o.status))

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      <StoreHeader title="Merchandise" backHref="/runner" />

      <div className="flex flex-col px-5 py-5 gap-7">
        {/* FR-69: shop by registered event */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-[#e5e1e4] tracking-tight">Shop event merch</h2>
          {shopEvents.length > 0 ? (
            shopEvents.map((event) => (
              <Link
                key={event.id}
                href={`/runner/events/${event.id}/merch`}
                className="relative overflow-hidden flex items-center gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-[#353437]/60 active:scale-[0.98] transition-transform"
              >
                <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-[#d0bcff]/10 blur-2xl pointer-events-none" />
                <div className="w-11 h-11 rounded-xl bg-[#d0bcff]/10 border border-[#d0bcff]/25 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[22px] text-[#d0bcff]">shopping_bag</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-[#e5e1e4] truncate">{event.name}</p>
                  <p className="text-[11px] text-[#958ea0]">
                    {new Date(event.event_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {event.productCount} {event.productCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[20px] text-[#cbc3d7]">chevron_right</span>
              </Link>
            ))
          ) : (
            <div className="p-5 rounded-2xl bg-[#1c1b1d] border border-[#353437]/60 text-center">
              <p className="text-[13px] font-bold text-[#e5e1e4] mb-1">No merch on sale</p>
              <p className="text-[12px] text-[#958ea0]">
                Merch appears here for upcoming events you&apos;re registered for.
              </p>
            </div>
          )}
        </section>

        {/* FR-73: order history */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold text-[#e5e1e4] tracking-tight">Your orders</h2>
          {orders.length === 0 ? (
            <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-8 flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-[#23232b] rounded-full flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[28px] text-[#958ea0]">receipt_long</span>
              </div>
              <p className="text-[14px] font-bold text-[#e5e1e4] mb-1">No orders yet</p>
              <p className="text-[12px] text-[#958ea0]">Orders you place will show up here with their status.</p>
            </div>
          ) : (
            <>
              {activeOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
              {pastOrders.length > 0 && (
                <>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#958ea0] mt-2">Past orders</h3>
                  {pastOrders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function OrderCard({ order }: { order: RunnerMerchOrder }) {
  const count = orderItemCount(order)
  const names = order.merch_order_items.map((i) => i.product_name).filter(Boolean)
  return (
    <Link
      href={`/runner/merch/orders/${order.id}`}
      className="flex flex-col gap-3 p-4 rounded-2xl bg-[#1c1b1d] border border-[#353437]/60 active:scale-[0.98] transition-transform"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[14px] font-bold text-[#e5e1e4]">{order.order_number}</span>
          <span className="text-[11px] text-[#958ea0] truncate">
            {order.events?.name} · {formatOrderDate(order.created_at)}
          </span>
        </div>
        <OrderStatusChip status={order.status} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[12px] text-[#cbc3d7] line-clamp-1 min-w-0">
          {count} {count === 1 ? 'item' : 'items'}
          {names.length > 0 ? ` · ${names.join(', ')}` : ''}
        </span>
        <span className="font-mono text-[15px] font-extrabold text-[#d0bcff] whitespace-nowrap">
          {formatRM(Number(order.total_amount))}
        </span>
      </div>
    </Link>
  )
}
