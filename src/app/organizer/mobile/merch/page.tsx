import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MerchEventPicker } from '@/components/merch/event-picker'
import { OrderTable } from '@/components/merch/order-table'
import { getMerchHubData, getOrganizerMerchEvents, pickDefaultEvent } from '@/components/merch/queries'
import { formatRM, stockLevel, variantLabel } from '@/lib/merch'

function MobileHeader({ subtitle, alerts }: { subtitle?: string; alerts?: number }) {
  return (
    <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#353437]/40 px-5 pt-safe">
      <div className="h-14 flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[16px] font-bold text-[#e5e1e4]">Merch Hub</span>
            {alerts ? (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#f5c26b]/20 text-[#f5c26b]">
                {alerts} low stock
              </span>
            ) : null}
          </div>
          {subtitle && <span className="block text-[10px] text-[#958ea0] truncate max-w-[220px]">{subtitle}</span>}
        </div>
        <Link
          href="/organizer/merch"
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#2a2a2c] text-[#cbc3d7] text-[11px] font-medium border border-[#353437]/60"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_full</span>
          Full View
        </Link>
      </div>
    </header>
  )
}

export default async function OrganizerMobileMerchPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const [params, supabase] = await Promise.all([searchParams, createClient()])
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id as string | undefined

  const events = organizerId ? await getOrganizerMerchEvents(supabase, organizerId) : []
  const event = pickDefaultEvent(events, params.event)

  if (!organizerId || !event) {
    return (
      <div className="flex flex-col min-h-screen bg-[#131315]">
        <MobileHeader />
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-[#958ea0]">
          <span className="material-symbols-outlined text-[48px] mb-3">shopping_bag</span>
          <p className="text-[14px] font-medium">No events yet</p>
          <p className="text-[12px] mt-1">Create an event to sell merchandise</p>
          <Link href="/organizer/mobile/events" className="mt-4 px-5 py-2.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold">
            View Events
          </Link>
        </div>
      </div>
    )
  }

  const { products, orders, sales } = await getMerchHubData(supabase, event.id)

  const lowStock = products.flatMap((p) =>
    p.merch_variants
      .filter((v) => stockLevel(v.stock, p.low_stock_threshold) !== 'ok')
      .map((v) => ({ id: v.id, name: p.name, variant: variantLabel(v), stock: v.stock }))
  )
  const revenue = sales.reduce((sum, s) => sum + s.revenue, 0)
  const toFulfil = orders.filter((o) => o.status === 'confirmed').length
  const readyCount = orders.filter((o) => o.status === 'ready').length

  return (
    <div className="flex flex-col w-full bg-[#131315] min-h-screen">
      <MobileHeader subtitle={event.name} alerts={lowStock.length} />

      <div className="flex flex-col px-4 py-4 space-y-5">
        {events.length > 1 && <MerchEventPicker events={events} value={event.id} />}

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'To fulfil', value: toFulfil },
            { label: 'Ready', value: readyCount },
            { label: 'Revenue', value: formatRM(revenue) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-[#201f22] p-3 border border-[#353437]/40">
              <div className="text-[10px] uppercase tracking-wider text-[#958ea0] font-semibold">{s.label}</div>
              <div className="text-[18px] font-extrabold text-[#e5e1e4] mt-1 truncate tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Low stock */}
        {lowStock.length > 0 && (
          <section className="rounded-xl bg-[#f5c26b]/5 border border-[#f5c26b]/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[16px] text-[#f5c26b]">warning</span>
              <span className="text-[12px] font-bold text-[#f5c26b]">Low or sold out</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {lowStock.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-[12px]">
                  <span className="text-[#e5e1e4] truncate">
                    {item.name} <span className="text-[#958ea0]">· {item.variant}</span>
                  </span>
                  <span className={`font-bold ${item.stock === 0 ? 'text-[#ffb4ab]' : 'text-[#f5c26b]'}`}>
                    {item.stock === 0 ? 'Sold out' : item.stock}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Orders */}
        <section>
          <h2 className="text-[12px] font-bold text-[#cbc3d7] uppercase tracking-wider mb-3">Orders</h2>
          {products.length === 0 && orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#958ea0]">
              <span className="material-symbols-outlined text-[48px] mb-3">inventory_2</span>
              <p className="text-[14px] font-medium">No merchandise yet</p>
              <p className="text-[12px] mt-1">Add products from the full organizer view</p>
              <Link href="/organizer/merch" className="mt-4 px-5 py-2.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold">
                Manage Merch
              </Link>
            </div>
          ) : (
            <OrderTable orders={orders} />
          )}
        </section>
      </div>
    </div>
  )
}
