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
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      {/* Ambient */}
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-[#4cd7f6]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#4cd7f6]/10 text-[#acedff] uppercase w-fit">
              Inventory Module
            </span>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">Merch & Kit Inventory</h1>
            <p className="text-[14px] leading-[20px] text-[#cbc3d7]">Manage your race kit products, variants, and stock levels.</p>
          </div>
          <button className="px-5 py-2.5 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-[#a078ff] transition-all shadow-[0_0_16px_rgba(208,188,255,0.25)] whitespace-nowrap self-start md:self-auto">
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add Product
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Products', value: products?.length || 0, icon: 'inventory_2', color: 'text-[#4cd7f6]' },
            { label: 'Active', value: activeProducts, icon: 'check_circle', color: 'text-[#4edea3]' },
            { label: 'SKU Variants', value: totalVariants, icon: 'style', color: 'text-[#d0bcff]' },
            { label: 'Low Stock', value: 0, icon: 'warning', color: 'text-[#ffb4ab]' },
          ].map(s => (
            <div key={s.label} className="bg-[#1c1b1d] rounded-xl p-4 border border-[#23232b] flex items-center gap-3">
              <span className={`material-symbols-outlined text-[24px] ${s.color}`}>{s.icon}</span>
              <div>
                <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">{s.value}</div>
                <div className="text-[11px] text-[#958ea0]">{s.label}</div>
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
                <div key={product.id} className="bg-[#1c1b1d] rounded-xl border border-[#23232b] overflow-hidden group hover:border-[#4cd7f6]/30 transition-all">
                  <div className="h-1.5 bg-gradient-to-r from-[#4cd7f6] to-[#4edea3]" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-[#201f22] flex items-center justify-center text-[#4cd7f6] shrink-0">
                            <span className="material-symbols-outlined text-[18px]">apparel</span>
                          </div>
                          <h3 className="text-[15px] leading-[20px] font-semibold text-[#e5e1e4] group-hover:text-[#4cd7f6] transition-colors truncate">{product.name}</h3>
                        </div>
                        {product.description && (
                          <p className="text-[12px] leading-[16px] text-[#958ea0] mt-1">{product.description}</p>
                        )}
                      </div>
                      <span className={`shrink-0 text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold border ${product.is_active ? 'text-[#4edea3] bg-[#4edea3]/15 border-[#4edea3]/20' : 'text-[#cbc3d7] bg-[#353437] border-[#494454]'}`}>
                        {product.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-[#e5e1e4]">RM {Number(product.price).toFixed(2)}</span>
                        <span className="text-[11px] text-[#958ea0]">{variants.length} variant{variants.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[22px] leading-[28px] tracking-[-0.015em] font-semibold ${isLowStock ? 'text-[#ffb4ab]' : 'text-[#4edea3]'}`}>
                          {totalStock}
                        </span>
                        <div className={`text-[11px] ${isLowStock ? 'text-[#ffb4ab]' : 'text-[#958ea0]'}`}>
                          {isLowStock ? 'Low stock!' : 'in stock'}
                        </div>
                      </div>
                    </div>

                    {/* Variants preview */}
                    {variants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {variants.slice(0, 5).map((v: { id: string; size?: string; color?: string; stock_quantity?: number }) => (
                          <span key={v.id} className="text-[10px] leading-[14px] px-2 py-0.5 rounded border border-[#494454] text-[#cbc3d7]">
                            {[v.size, v.color].filter(Boolean).join(' / ') || 'Variant'} ({v.stock_quantity || 0})
                          </span>
                        ))}
                        {variants.length > 5 && (
                          <span className="text-[10px] px-2 py-0.5 rounded border border-[#494454] text-[#958ea0]">+{variants.length - 5}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-3 border-t border-[#23232b]">
                      <button className="flex-1 py-2 bg-[#201f22] hover:bg-[#2a2a2c] text-[#e5e1e4] text-[12px] leading-[16px] font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-[#353437]">
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        Edit
                      </button>
                      <button className="p-2 text-[#958ea0] hover:text-[#ffb4ab] hover:bg-[#ffb4ab]/10 rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-[#4cd7f6]/10 flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-[48px] text-[#4cd7f6]">inventory_2</span>
            </div>
            <h3 className="text-[22px] leading-[28px] font-semibold text-[#e5e1e4] mb-2">No merchandise yet</h3>
            <p className="text-[14px] leading-[20px] text-[#958ea0] mb-8 max-w-sm">
              Add race kits, jerseys, and accessories to include in your event packages.
            </p>
            <button className="px-6 py-3 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-[#a078ff] transition-all shadow-[0_0_20px_rgba(208,188,255,0.3)]">
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Add your first product
            </button>
          </div>
        )}
      </div>
    </div>
  )
}