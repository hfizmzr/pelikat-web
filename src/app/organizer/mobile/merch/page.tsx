import { Maximize2, Package, ShoppingBag, TriangleAlert } from "lucide-react"
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'

async function getMerchInventoryData() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id
  if (!organizerId) return null

  // Get active or upcoming event for merch context
  const { data: event } = await supabase
    .from('events')
    .select('id, name, status')
    .eq('organizer_id', organizerId)
    .in('status', ['active', 'published'])
    .order('event_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!event) return { event: null, items: [] }

  // Get merchandise items for this event
  const { data: merch } = await supabase
    .from('merchandise')
    .select(`
      id, name, description, price, stock_quantity, image_url,
      merchandise_variants(id, name, sku, stock_quantity, price)
    `)
    .eq('event_id', event.id)
    .order('name')

  const items = (merch || []).map((item) => {
    const variants = (item.merchandise_variants || []) as Array<{
      id: string; name: string; sku: string; stock_quantity: number; price: number
    }>
    const totalStock = variants.length > 0
      ? variants.reduce((a, v) => a + (v.stock_quantity || 0), 0)
      : (item.stock_quantity || 0)

    const criticalVariants = variants.filter((v) => v.stock_quantity <= 5)
    const isLowStock = totalStock <= 20 || criticalVariants.length > 0

    return {
      id: item.id,
      name: item.name,
      price: item.price,
      totalStock,
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        stock: v.stock_quantity,
        price: v.price,
        isLow: v.stock_quantity <= 5,
        isCritical: v.stock_quantity <= 2,
      })),
      isLowStock,
    }
  })

  const totalItems = items.reduce((a, i) => a + i.totalStock, 0)
  const criticalItems = items.filter((i) => i.isLowStock)

  return { event: { id: event.id, name: event.name }, items, totalItems, criticalItems: criticalItems.length }
}

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 2) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-300/20 text-red-300">Critical</span>
  if (stock <= 10) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary">Low</span>
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success">Healthy</span>
}

export default async function OrganizerMobileMerchPage() {
  const data = await getMerchInventoryData()

  if (!data) {
    return (
      <div className="flex flex-col min-h-dvh bg-background">
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
          <div className="h-14 flex items-center">
            <span className="text-[16px] font-bold text-foreground">Kit Inventory</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-muted-foreground">
          <span className="size-[48px] mb-3"><Package className="size-[48px] mb-3" /></span>
          <p className="text-[14px] font-medium">No access</p>
        </div>
      </div>
    )
  }

  if (!data.event) {
    return (
      <div className="flex flex-col min-h-dvh bg-background">
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
          <div className="h-14 flex items-center">
            <span className="text-[16px] font-bold text-foreground">Kit Inventory</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-muted-foreground">
          <span className="size-[48px] mb-3"><ShoppingBag className="size-[48px] mb-3" /></span>
          <p className="text-[14px] font-medium">No active event</p>
          <p className="text-[12px] mt-1">Activate an event to manage inventory</p>
          <Link href="/organizer/mobile/events" className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold">
            View Events
          </Link>
        </div>
      </div>
    )
  }

  const { event, items, totalItems = 0, criticalItems = 0 } = data

  return (
    <div className="flex flex-col w-full bg-background min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[16px] font-bold text-foreground">Kit Inventory</span>
              {criticalItems > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-300/20 text-red-300">
                  {criticalItems} critical
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                {event.name}
              </span>
            </div>
          </div>
          <Link
            href="/organizer/merch"
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-accent text-muted-foreground text-[11px] font-medium border border-border/60"
          >
            <span className="size-[14px]"><Maximize2 className="size-[14px]" /></span>
            Full View
          </Link>
        </div>
      </header>

      <div className="flex flex-col px-4 py-4 space-y-5">

        {/* Summary banner */}
        <div className="relative overflow-hidden rounded-xl bg-card p-4 border border-border/40 shadow-md">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Total Floor Inventory
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-[28px] font-extrabold text-foreground tracking-tight">
                  {totalItems}
                </span>
                <span className="text-[12px] text-muted-foreground">Units Remaining</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[11px] text-primary font-bold">{items.length} SKUs</span>
              {criticalItems > 0 && (
                <span className="text-[11px] text-red-300 mt-0.5">{criticalItems} low stock</span>
              )}
            </div>
          </div>

          {/* Critical alert */}
          {criticalItems > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-red-800/30 flex items-start gap-2 border border-red-300/20">
              <TriangleAlert className="size-[16px] text-red-300 shrink-0" />
              <p className="text-[11px] text-red-300">
                {criticalItems} variant(s) at critical stock level. Restock required.
              </p>
            </div>
          )}
        </div>

        {/* Merch items */}
        {items.length > 0 ? (
          <section>
            <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Kit Matrix
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl bg-card border border-border/40 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[14px] font-bold text-foreground">{item.name}</h3>
                      <StockBadge stock={item.totalStock} />
                    </div>

                    {item.variants.length > 0 ? (
                      <div className="space-y-2">
                        {item.variants.map((v) => (
                          <div
                            key={v.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg ${
                              v.isCritical ? 'bg-red-300/5 border border-red-300/20' :
                              v.isLow ? 'bg-primary/5 border border-primary/15' :
                              'bg-accent'
                            }`}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[12px] font-semibold text-foreground">{v.name}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{v.sku}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[16px] font-bold ${
                                v.isCritical ? 'text-red-300' : v.isLow ? 'text-primary' : 'text-foreground'
                              }`}>
                                {v.stock}
                              </span>
                              <span className="text-[10px] text-muted-foreground">units</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-muted-foreground">Total stock</span>
                        <span className="text-[18px] font-bold text-foreground">{item.totalStock}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="size-[48px] mb-3" />
            <p className="text-[14px] font-medium">No merchandise yet</p>
            <p className="text-[12px] mt-1">Add items from the full organizer view</p>
            <Link
              href="/organizer/merch"
              className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold"
            >
              Manage Merch
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
