import { CircleCheck, CirclePlus, Package, Palette, Pencil, Shirt, Trash2, TriangleAlert } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Merch & Kit Inventory - Organizer Hub | Pelikat',
  description: 'Manage event merchandise and race kit inventory',
}

export default async function OrganizerMerchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  const { data: products } = await supabase
    .from('merch_products')
    .select('*, merch_variants(*)')
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false })

  const totalVariants = products?.reduce((a, p) => a + (p.merch_variants?.length || 0), 0) || 0
  const activeProducts = products?.filter(p => p.is_active).length || 0

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      {/* Ambient */}
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase w-fit">
              Inventory Module
            </span>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">Merch & Kit Inventory</h1>
            <p className="text-[14px] leading-[20px] text-muted-foreground">Manage your race kit products, variants, and stock levels.</p>
          </div>
          <button className="px-5 py-2.5 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all whitespace-nowrap self-start md:self-auto">
            <CirclePlus className="size-[18px]" />
            Add Product
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Products', value: products?.length || 0, icon: Package, color: 'text-primary' },
            { label: 'Active', value: activeProducts, icon: CircleCheck, color: 'text-success' },
            { label: 'SKU Variants', value: totalVariants, icon: Palette, color: 'text-primary' },
            { label: 'Low Stock', value: 0, icon: TriangleAlert, color: 'text-red-500 dark:text-red-300' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl p-4 border border-muted flex items-center gap-3">
              <span className={`size-[24px] ${s.color}`}><s.icon className="size-[24px]" /></span>
              <div>
                <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-foreground">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Products grid */}
        {products && products.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
              const variants = product.merch_variants || []
              const totalStock = variants.reduce((a: number, v: { stock_quantity?: number }) => a + (v.stock_quantity || 0), 0)
              const isLowStock = totalStock > 0 && totalStock < 50

              return (
                <div key={product.id} className="bg-card rounded-xl border border-muted overflow-hidden group hover:border-primary/30 transition-all">
                  <div className="h-1.5 bg-gradient-to-r from-primary to-success" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center text-primary shrink-0">
                            <Shirt className="size-[18px]" />
                          </div>
                          <h3 className="text-[15px] leading-[20px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">{product.name}</h3>
                        </div>
                        {product.description && (
                          <p className="text-[12px] leading-[16px] text-muted-foreground mt-1">{product.description}</p>
                        )}
                      </div>
                      <span className={`shrink-0 text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold border ${product.is_active ? 'text-success bg-success/15 border-success/20' : 'text-muted-foreground bg-accent border-border'}`}>
                        {product.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-foreground">RM {Number(product.price).toFixed(2)}</span>
                        <span className="text-[11px] text-muted-foreground">{variants.length} variant{variants.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[22px] leading-[28px] tracking-[-0.015em] font-semibold ${isLowStock ? 'text-red-500 dark:text-red-300' : 'text-success'}`}>
                          {totalStock}
                        </span>
                        <div className={`text-[11px] ${isLowStock ? 'text-red-500 dark:text-red-300' : 'text-muted-foreground'}`}>
                          {isLowStock ? 'Low stock!' : 'in stock'}
                        </div>
                      </div>
                    </div>

                    {/* Variants preview */}
                    {variants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {variants.slice(0, 5).map((v: { id: string; size?: string; color?: string; stock_quantity?: number }) => (
                          <span key={v.id} className="text-[10px] leading-[14px] px-2 py-0.5 rounded border border-border text-muted-foreground">
                            {[v.size, v.color].filter(Boolean).join(' / ') || 'Variant'} ({v.stock_quantity || 0})
                          </span>
                        ))}
                        {variants.length > 5 && (
                          <span className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground">+{variants.length - 5}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-3 border-t border-muted">
                      <button className="flex-1 py-2 bg-card hover:bg-accent text-foreground text-[12px] leading-[16px] font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-border">
                        <Pencil className="size-[16px]" />
                        Edit
                      </button>
                      <button className="p-2 text-muted-foreground hover:text-red-500 dark:text-red-300 hover:bg-red-500/10 dark:bg-red-500 dark:bg-red-300/10 rounded-lg transition-colors">
                        <Trash2 className="size-[18px]" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-muted p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Package className="size-[48px] text-primary" />
            </div>
            <h3 className="text-[22px] leading-[28px] font-semibold text-foreground mb-2">No merchandise yet</h3>
            <p className="text-[14px] leading-[20px] text-muted-foreground mb-8 max-w-sm">
              Add race kits, jerseys, and accessories to include in your event packages.
            </p>
            <button className="px-6 py-3 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all ">
              <CirclePlus className="size-[18px]" />
              Add your first product
            </button>
          </div>
        )}
      </div>
    </div>
  )
}