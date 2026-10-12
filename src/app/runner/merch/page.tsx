import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Merchandise - Pelikat',
  description: 'Your merchandise orders',
}

export default async function RunnerMerchPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: orders } = await supabase
    .from('merch_orders')
    .select('*, merch_order_items(*, merch_variants(*, merch_products(*)))')
    .eq('runner_id', profile?.id)
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-[#e5e1e4] leading-tight">
              Merchandise
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto pb-24">
        
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#d0bcff]/10 border border-[#d0bcff]/30 rounded-full flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[32px] text-[#d0bcff]">shopping_bag</span>
          </div>
          <h2 className="text-[20px] font-bold text-[#e5e1e4] tracking-tight">Your Orders</h2>
          <p className="text-[13px] text-[#958ea0] mt-1">Track your merchandise purchases</p>
        </div>

        {orders && orders.length > 0 ? (
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-[#353437]/60 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-[#e5e1e4]">Order #{order.id.slice(0, 8)}</span>
                    <span className="text-[11px] text-[#958ea0]">
                      {new Date(order.created_at).toLocaleDateString('en-MY', { 
                        month: 'short', day: 'numeric', year: 'numeric' 
                      })}
                    </span>
                  </div>
                  
                  <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    order.status === 'paid'
                      ? 'bg-[#4edea3]/10 text-[#4edea3] border border-[#4edea3]/20'
                      : 'bg-[#23232b] text-[#cbc3d7] border border-[#353437]'
                  }`}>
                    {order.status}
                  </div>
                </div>
                
                <div className="p-4 flex flex-col gap-3">
                  {order.merch_order_items?.map((item: { id: string; quantity: number; unit_price: number; merch_variants: { merch_products: { name: string } | null } | null }) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#23232b] border border-[#353437] flex items-center justify-center text-[#cbc3d7]">
                          <span className="material-symbols-outlined text-[20px]">checkroom</span>
                        </div>
                        <div className="flex flex-col max-w-[150px]">
                          <span className="text-[13px] font-bold text-[#e5e1e4] truncate">{item.merch_variants?.merch_products?.name}</span>
                          <span className="text-[11px] text-[#958ea0]">Qty: {item.quantity}</span>
                        </div>
                      </div>
                      <span className="font-mono text-[14px] font-bold text-[#e5e1e4]">
                        RM {((item.unit_price * item.quantity) / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                
                <div className="p-4 bg-[#23232b]/50 border-t border-[#353437]/40 flex justify-between items-center">
                  <span className="text-[12px] font-bold text-[#958ea0] uppercase tracking-widest">Total Amount</span>
                  <span className="font-mono text-[18px] font-extrabold text-[#d0bcff]">
                    RM {(order.total_amount / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-8 flex flex-col items-center text-center mt-4">
            <div className="w-16 h-16 bg-[#23232b] rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px] text-[#958ea0]">shopping_cart</span>
            </div>
            <p className="text-[16px] font-bold text-[#e5e1e4] mb-2">No orders yet</p>
            <p className="text-[13px] text-[#958ea0]">
              Purchase merchandise from your registered events
            </p>
          </div>
        )}
      </div>
    </div>
  )
}