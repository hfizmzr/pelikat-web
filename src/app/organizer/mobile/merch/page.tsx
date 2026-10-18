import { Maximize2, Package, ShoppingBag, TriangleAlert } from "lucide-react"
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MerchEventPicker } from '@/components/merch/event-picker'
import { OrderTable } from '@/components/merch/order-table'
import { getMerchHubData, getOrganizerMerchEvents, pickDefaultEvent } from '@/components/merch/queries'
import { formatRM, stockLevel, variantLabel } from '@/lib/merch'

function MobileHeader({ subtitle, alerts }: { subtitle?: string; alerts?: number }) {
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
      <div className="h-14 flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[16px] font-bold text-foreground">Merch Hub</span>
            {alerts ? (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 dark:bg-amber-400/20 text-amber-500 dark:text-amber-400">
                {alerts} low stock
              </span>
            ) : null}
          </div>
          {subtitle && <span className="block text-[10px] text-muted-foreground truncate max-w-[220px]">{subtitle}</span>}
        </div>
        <Link
          href="/organizer/merch"
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-accent text-muted-foreground text-[11px] font-medium border border-border/60"
        >
          <Maximize2 className="size-[14px]" />
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
      <div className="flex flex-col min-h-dvh bg-background">
        <MobileHeader />
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-muted-foreground">
          <ShoppingBag className="size-[48px] mb-3" />
          <p className="text-[14px] font-medium">No events yet</p>
          <p className="text-[12px] mt-1">Create an event to sell merchandise</p>
          <Link href="/organizer/mobile/events" className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold">
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
    <div className="flex flex-col w-full bg-background min-h-dvh">
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
            <div key={s.label} className="rounded-xl bg-card p-3 border border-border/40">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
              <div className="text-[18px] font-extrabold text-foreground mt-1 truncate tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Low stock */}
        {lowStock.length > 0 && (
          <section className="rounded-xl bg-amber-500/5 dark:bg-amber-400/5 border border-amber-500/20 dark:border-amber-400/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <TriangleAlert className="size-[16px] text-amber-500 dark:text-amber-400" />
              <span className="text-[12px] font-bold text-amber-500 dark:text-amber-400">Low or sold out</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {lowStock.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-[12px]">
                  <span className="text-foreground truncate">
                    {item.name} <span className="text-muted-foreground">· {item.variant}</span>
                  </span>
                  <span className={`font-bold ${item.stock === 0 ? 'text-red-500 dark:text-red-300' : 'text-amber-500 dark:text-amber-400'}`}>
                    {item.stock === 0 ? 'Sold out' : item.stock}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Orders */}
        <section>
          <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Orders</h2>
          {products.length === 0 && orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="size-[48px] mb-3" />
              <p className="text-[14px] font-medium">No merchandise yet</p>
              <p className="text-[12px] mt-1">Add products from the full organizer view</p>
              <Link href="/organizer/merch" className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold">
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
