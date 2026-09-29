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
  if (stock <= 2) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ffb4ab]/20 text-[#ffb4ab]">Critical</span>
  if (stock <= 10) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#d0bcff]/20 text-[#d0bcff]">Low</span>
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#4edea3]/15 text-[#4edea3]">Healthy</span>
}

export default async function OrganizerMobileMerchPage() {
  const data = await getMerchInventoryData()

  if (!data) {
    return (
      <div className="flex flex-col min-h-screen bg-[#131315]">
        <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#353437]/40 px-5 pt-safe">
          <div className="h-14 flex items-center">
            <span className="text-[16px] font-bold text-[#e5e1e4]">Kit Inventory</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-[#958ea0]">
          <span className="material-symbols-outlined text-[48px] mb-3">inventory</span>
          <p className="text-[14px] font-medium">No access</p>
        </div>
      </div>
    )
  }

  if (!data.event) {
    return (
      <div className="flex flex-col min-h-screen bg-[#131315]">
        <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#353437]/40 px-5 pt-safe">
          <div className="h-14 flex items-center">
            <span className="text-[16px] font-bold text-[#e5e1e4]">Kit Inventory</span>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-[#958ea0]">
          <span className="material-symbols-outlined text-[48px] mb-3">shopping_bag</span>
          <p className="text-[14px] font-medium">No active event</p>
          <p className="text-[12px] mt-1">Activate an event to manage inventory</p>
          <Link href="/organizer/mobile/events" className="mt-4 px-5 py-2.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold">
            View Events
          </Link>
        </div>
      </div>
    )
  }

  const { event, items, totalItems = 0, criticalItems = 0 } = data

  return (
    <div className="flex flex-col w-full bg-[#131315] min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#353437]/40 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[16px] font-bold text-[#e5e1e4]">Kit Inventory</span>
              {criticalItems > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#ffb4ab]/20 text-[#ffb4ab]">
                  {criticalItems} critical
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />
              <span className="text-[10px] text-[#958ea0] truncate max-w-[200px]">
                {event.name}
              </span>
            </div>
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

      <div className="flex flex-col px-4 py-4 space-y-5">

        {/* Summary banner */}
        <div className="relative overflow-hidden rounded-xl bg-[#201f22] p-4 border border-[#353437]/40 shadow-md">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-[#d0bcff]/10 blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#cbc3d7] font-semibold">
                Total Floor Inventory
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-[28px] font-extrabold text-[#e5e1e4] tracking-tight">
                  {totalItems}
                </span>
                <span className="text-[12px] text-[#cbc3d7]">Units Remaining</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[11px] text-[#4cd7f6] font-bold">{items.length} SKUs</span>
              {criticalItems > 0 && (
                <span className="text-[11px] text-[#ffb4ab] mt-0.5">{criticalItems} low stock</span>
              )}
            </div>
          </div>

          {/* Critical alert */}
          {criticalItems > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-[#93000a]/30 flex items-start gap-2 border border-[#ffb4ab]/20">
              <span className="material-symbols-outlined text-[16px] text-[#ffb4ab] shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                warning
              </span>
              <p className="text-[11px] text-[#ffb4ab]">
                {criticalItems} variant(s) at critical stock level. Restock required.
              </p>
            </div>
          )}
        </div>

        {/* Merch items */}
        {items.length > 0 ? (
          <section>
            <h2 className="text-[12px] font-bold text-[#cbc3d7] uppercase tracking-wider mb-3">
              Kit Matrix
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl bg-[#1c1b1d] border border-[#353437]/40 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[14px] font-bold text-[#e5e1e4]">{item.name}</h3>
                      <StockBadge stock={item.totalStock} />
                    </div>

                    {item.variants.length > 0 ? (
                      <div className="space-y-2">
                        {item.variants.map((v) => (
                          <div
                            key={v.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg ${
                              v.isCritical ? 'bg-[#ffb4ab]/5 border border-[#ffb4ab]/20' :
                              v.isLow ? 'bg-[#d0bcff]/5 border border-[#d0bcff]/15' :
                              'bg-[#2a2a2c]'
                            }`}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[12px] font-semibold text-[#e5e1e4]">{v.name}</span>
                              <span className="text-[10px] font-mono text-[#958ea0]">{v.sku}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[16px] font-bold ${
                                v.isCritical ? 'text-[#ffb4ab]' : v.isLow ? 'text-[#d0bcff]' : 'text-[#e5e1e4]'
                              }`}>
                                {v.stock}
                              </span>
                              <span className="text-[10px] text-[#958ea0]">units</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-[#cbc3d7]">Total stock</span>
                        <span className="text-[18px] font-bold text-[#e5e1e4]">{item.totalStock}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-[#958ea0]">
            <span className="material-symbols-outlined text-[48px] mb-3">inventory_2</span>
            <p className="text-[14px] font-medium">No merchandise yet</p>
            <p className="text-[12px] mt-1">Add items from the full organizer view</p>
            <Link
              href="/organizer/merch"
              className="mt-4 px-5 py-2.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold"
            >
              Manage Merch
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
