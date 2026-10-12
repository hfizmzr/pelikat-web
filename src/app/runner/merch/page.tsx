import { ArrowLeft, Shirt, ShoppingBag, ShoppingCart } from "lucide-react"
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
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <span className="size-[24px]"><ArrowLeft className="size-[24px]" /></span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-foreground leading-tight">
              Merchandise
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto pb-24">
        
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-primary/10 border border-primary/30 rounded-full flex items-center justify-center mb-3">
            <span className="size-[32px] text-primary"><ShoppingBag className="size-[32px] text-primary" /></span>
          </div>
          <h2 className="text-[20px] font-bold text-foreground tracking-tight">Your Orders</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Track your merchandise purchases</p>
        </div>

        {orders && orders.length > 0 ? (
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-card rounded-2xl border border-border/60 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border/60 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-foreground">Order #{order.id.slice(0, 8)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString('en-MY', { 
                        month: 'short', day: 'numeric', year: 'numeric' 
                      })}
                    </span>
                  </div>
                  
                  <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    order.status === 'paid'
                      ? 'bg-success/10 text-success border border-success/20'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                    {order.status}
                  </div>
                </div>
                
                <div className="p-4 flex flex-col gap-3">
                  {order.merch_order_items?.map((item: { id: string; quantity: number; unit_price: number; merch_variants: { merch_products: { name: string } | null } | null }) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground">
                          <span className="size-[20px]"><Shirt className="size-[20px]" /></span>
                        </div>
                        <div className="flex flex-col max-w-[150px]">
                          <span className="text-[13px] font-bold text-foreground truncate">{item.merch_variants?.merch_products?.name}</span>
                          <span className="text-[11px] text-muted-foreground">Qty: {item.quantity}</span>
                        </div>
                      </div>
                      <span className="font-mono text-[14px] font-bold text-foreground">
                        RM {((item.unit_price * item.quantity) / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                
                <div className="p-4 bg-muted/50 border-t border-border/40 flex justify-between items-center">
                  <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest">Total Amount</span>
                  <span className="font-mono text-[18px] font-extrabold text-primary">
                    RM {(order.total_amount / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border/60 p-8 flex flex-col items-center text-center mt-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <span className="size-[32px] text-muted-foreground"><ShoppingCart className="size-[32px] text-muted-foreground" /></span>
            </div>
            <p className="text-[16px] font-bold text-foreground mb-2">No orders yet</p>
            <p className="text-[13px] text-muted-foreground">
              Purchase merchandise from your registered events
            </p>
          </div>
        )}
      </div>
    </div>
  )
}