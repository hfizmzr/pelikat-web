import { Plus, Store } from "lucide-react"
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
  title: 'Merch - Pelikat',
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
        <div className="bg-card rounded-xl border border-border p-16 flex flex-col items-center text-center">
          <Store className="size-[48px] text-primary mb-4" />
          <h1 className="text-[22px] font-medium text-foreground mb-2">Create an event first</h1>
          <p className="text-[14px] text-muted-foreground mb-6 max-w-sm">
            Merchandise is sold per event. Create an event to start listing products.
          </p>
          <Link
            href="/organizer/events/new"
            className="px-5 py-2.5 bg-primary text-primary-foreground text-[14px] font-medium rounded-lg hover:opacity-90 transition-[color,background-color,border-color,opacity]"
          >
            Create event
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
        <button className="h-10 px-4 bg-primary text-primary-foreground text-[14px] font-medium rounded-lg flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap">
          <Plus className="size-4" strokeWidth={2} />
          Add product
        </button>
      }
    />
  )

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">

      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[28px] leading-9 font-medium text-foreground">Merch</h1>
            <p className="text-[14px] text-muted-foreground">
              Products, stock, orders and sales for each event. Runners collect at kit collection
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <MerchEventPicker events={events} value={event.id} />
            {addProductButton}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            Could not load all merch data: {error.message}
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Products', value: products.length.toLocaleString(), warn: false },
            { label: 'Low stock', value: stockAlerts.toLocaleString(), warn: stockAlerts > 0 },
            { label: 'Orders to fulfil', value: toFulfil.toLocaleString(), warn: false },
            { label: 'Revenue', value: formatRM(revenue), warn: false },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-5">
              <p className="text-[13px] text-muted-foreground">{s.label}</p>
              <p className={`mt-2 truncate text-[28px] leading-none font-medium tabular-nums ${s.warn ? 'text-warning' : 'text-foreground'}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue={initialTab} className="gap-4">
          <TabsList className="w-full sm:w-fit overflow-x-auto justify-start">
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="inventory">
              Inventory
              {stockAlerts > 0 && (
                <span className="ml-1 font-mono text-[12px] text-warning">{stockAlerts}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders">
              Orders
              {toFulfil > 0 && (
                <span className="ml-1 font-mono text-[12px] text-muted-foreground">{toFulfil}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            {products.length > 0 ? (
              <ProductGrid products={products} eventId={event.id} organizerId={organizerId} />
            ) : (
              <div className="bg-card rounded-xl border border-border p-16 flex flex-col items-center justify-center text-center">
                <h3 className="text-[18px] font-medium text-foreground mb-2">No merch yet</h3>
                <p className="text-[14px] text-muted-foreground mb-6 max-w-sm">
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
