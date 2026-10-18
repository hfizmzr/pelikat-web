import { Banknote, CirclePlus, ClipboardList, Package, Store, TriangleAlert } from "lucide-react"
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MerchEventPicker } from '@/components/merch/event-picker'
import { ProductFormDialog } from '@/components/merch/product-form-dialog'
import { ProductGrid } from '@/components/merch/product-grid'
import { InventoryTable } from '@/components/merch/inventory-table'
import { OrderTable } from '@/components/merch/order-table'
import { SalesSummary } from '@/components/merch/sales-summary'
import { getMerchHubData, getOrganizerMerchEvents, pickDefaultEvent } from '@/components/merch/queries'
import { formatRM, stockLevel } from '@/lib/merch'

export const metadata: Metadata = {
  title: 'Merch Hub - Organizer Hub | Pelikat',
  description: 'Manage event merchandise, stock, orders and sales',
}

const TABS = ['products', 'inventory', 'orders', 'sales'] as const
type Tab = (typeof TABS)[number]

export default async function OrganizerMerchPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tab?: string }>
}) {
  const [params, supabase] = await Promise.all([searchParams, createClient()])
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id as string | undefined

  const events = organizerId ? await getOrganizerMerchEvents(supabase, organizerId) : []
  const event = pickDefaultEvent(events, params.event)
  const initialTab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'products'

  if (!organizerId || !event) {
    return (
      <div className="w-full min-h-full px-6 py-8 bg-background">
        <div className="bg-card rounded-xl border border-muted p-16 flex flex-col items-center text-center">
          <Store className="size-[48px] text-primary mb-4" />
          <h1 className="text-[22px] font-semibold text-foreground mb-2">Create an event first</h1>
          <p className="text-[14px] text-muted-foreground mb-6 max-w-sm">
            Merchandise is sold per event. Create an event to start listing products.
          </p>
          <Link
            href="/organizer/events/new"
            className="px-5 py-2.5 bg-primary text-primary-foreground text-[14px] font-semibold rounded-lg hover:bg-primary transition-all"
          >
            Create Event
          </Link>
        </div>
      </div>
    )
  }

  const { products, orders, sales, paidOrders, pendingOrders, error } = await getMerchHubData(supabase, event.id)

  const stockAlerts = products.reduce(
    (sum, p) => sum + p.merch_variants.filter((v) => stockLevel(v.stock, p.low_stock_threshold) !== 'ok').length,
    0
  )
  const toFulfil = orders.filter((o) => o.status === 'confirmed').length
  const revenue = sales.reduce((sum, s) => sum + s.revenue, 0)

  const addProductButton = (
    <ProductFormDialog
      eventId={event.id}
      organizerId={organizerId}
      trigger={
        <button className="h-11 px-5 bg-primary text-primary-foreground text-[14px] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all shadow-[0_0_16px_rgba(208,188,255,0.25)] whitespace-nowrap">
          <CirclePlus className="size-[18px]" />
          Add Product
        </button>
      }
    />
  )

  return (
    <div className="relative w-full min-h-full px-4 sm:px-6 py-8 bg-background">
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase w-fit">
              Merch Hub
            </span>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">Merch Hub Manager</h1>
            <p className="text-[14px] leading-[20px] text-muted-foreground">
              Products, stock, runner orders and sales for each event. Runners collect at REPC.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <MerchEventPicker events={events} value={event.id} />
            {addProductButton}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 dark:border-red-300/30 bg-red-500/10 dark:bg-red-300/10 px-4 py-3 text-[13px] text-red-500 dark:text-red-300">
            Could not load all merch data: {error.message}
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Products', value: products.length, icon: Package, color: 'text-primary' },
            { label: 'Stock alerts', value: stockAlerts, icon: TriangleAlert, color: stockAlerts > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground' },
            { label: 'Orders to fulfil', value: toFulfil, icon: ClipboardList, color: 'text-primary' },
            { label: 'Revenue', value: formatRM(revenue), icon: Banknote, color: 'text-success' },
          ].map((s) => (
            <div key={s.label} className="bg-card rounded-xl p-4 border border-muted flex items-center gap-3">
              <s.icon className={`size-[24px] ${s.color}`} />
              <div className="min-w-0">
                <div className="text-[20px] leading-[28px] tracking-[-0.01em] font-semibold text-foreground truncate tabular-nums">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue={initialTab} className="gap-4">
          <TabsList className="w-full sm:w-fit overflow-x-auto justify-start">
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="inventory">
              Inventory
              {stockAlerts > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 dark:bg-amber-400/20 text-amber-500 dark:text-amber-400 px-1.5 text-[10px] font-bold">{stockAlerts}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders">
              Orders
              {toFulfil > 0 && (
                <span className="ml-1 rounded-full bg-primary/20 text-primary px-1.5 text-[10px] font-bold">{toFulfil}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            {products.length > 0 ? (
              <ProductGrid products={products} eventId={event.id} organizerId={organizerId} />
            ) : (
              <div className="bg-card rounded-xl border border-muted p-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                  <Package className="size-[48px] text-primary" />
                </div>
                <h3 className="text-[22px] leading-[28px] font-semibold text-foreground mb-2">No merchandise yet</h3>
                <p className="text-[14px] leading-[20px] text-muted-foreground mb-8 max-w-sm">
                  Add finisher tees, caps and tumblers for {event.name}. Runners collect them with their race kit.
                </p>
                {addProductButton}
              </div>
            )}
          </TabsContent>

          <TabsContent value="inventory">
            <InventoryTable products={products} />
          </TabsContent>

          <TabsContent value="orders">
            <OrderTable orders={orders} />
          </TabsContent>

          <TabsContent value="sales">
            <SalesSummary sales={sales} paidOrders={paidOrders} pendingOrders={pendingOrders} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
