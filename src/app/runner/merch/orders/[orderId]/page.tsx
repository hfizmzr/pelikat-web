import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  MERCH_CANCEL_REASON_LABEL,
  MERCH_PAYMENT_METHOD_LABEL,
  MERCH_RUNNER_STATUS_META,
  RUNNER_MERCH_ORDER_SELECT,
  formatRM,
  type RunnerMerchOrder,
} from '@/lib/merch'
import { Notice, OrderStatusChip, StoreHeader, formatOrderDate } from '@/components/merch/store/store-ui'
import { PendingOrderActions } from '@/components/merch/store/pending-order-actions'

export const metadata: Metadata = {
  title: 'Merch Order - Pelikat',
  description: 'Your merchandise order',
}

const TIMELINE = [
  { status: 'confirmed', label: 'Paid', at: (o: RunnerMerchOrder) => o.paid_at },
  { status: 'ready', label: 'Ready to collect at REPC', at: (o: RunnerMerchOrder) => o.ready_at },
  { status: 'collected', label: 'Collected', at: (o: RunnerMerchOrder) => o.collected_at },
] as const

const STEP_INDEX: Record<string, number> = { pending: -1, confirmed: 0, ready: 1, collected: 2 }

export default async function RunnerMerchOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const [{ orderId }, { paid }, supabase] = await Promise.all([params, searchParams, createClient()])

  // RLS: runners only see their own orders
  const { data } = await supabase
    .from('merch_orders')
    .select(RUNNER_MERCH_ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle()

  const order = data as RunnerMerchOrder | null
  if (!order) notFound()

  const meta = MERCH_RUNNER_STATUS_META[order.status]
  const justPaid = paid === '1' && order.status === 'confirmed'
  const reached = STEP_INDEX[order.status] ?? -1

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      <StoreHeader title="Order details" subtitle={order.events?.name} backHref="/runner/merch" />

      <div className="flex flex-col px-5 py-5 gap-5">
        {/* FR-72: confirmation with the order number */}
        {justPaid ? (
          <section className="bg-[#4edea3]/10 border border-[#4edea3]/30 rounded-2xl p-5 flex flex-col items-center text-center gap-2">
            <span className="material-symbols-outlined text-[44px] text-[#4edea3]">check_circle</span>
            <h2 className="text-[18px] font-bold text-[#4edea3]">Payment successful</h2>
            <p className="text-[12px] text-[#4edea3]/80">Your order is confirmed. Keep this order number:</p>
            <span className="mt-1 px-4 py-2 rounded-xl bg-[#131315]/60 font-mono text-[22px] font-extrabold tracking-wider text-[#e5e1e4]">
              {order.order_number}
            </span>
          </section>
        ) : (
          <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">Order number</span>
              <span className="font-mono text-[18px] font-extrabold text-[#e5e1e4] tracking-wide">{order.order_number}</span>
              <span className="text-[11px] text-[#958ea0]">Placed {formatOrderDate(order.created_at)}</span>
            </div>
            <OrderStatusChip status={order.status} />
          </section>
        )}

        {/* FR-73: status */}
        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-[#d0bcff]">{meta.icon}</span>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-[#e5e1e4]">{meta.label}</span>
              <span className="text-[12px] text-[#958ea0] leading-[18px]">
                {order.status === 'cancelled' && order.cancel_reason
                  ? MERCH_CANCEL_REASON_LABEL[order.cancel_reason] ?? meta.description
                  : meta.description}
              </span>
            </div>
          </div>

          {order.status !== 'cancelled' && (
            <ol className="flex flex-col">
              {TIMELINE.map((step, i) => {
                const done = i <= reached
                const at = step.at(order)
                return (
                  <li key={step.status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                          done ? 'bg-[#4edea3] border-[#4edea3]' : 'border-[#494454]'
                        }`}
                      >
                        {done && <span className="material-symbols-outlined text-[14px] text-[#003926]">check</span>}
                      </span>
                      {i < TIMELINE.length - 1 && (
                        <span className={`w-0.5 flex-1 min-h-5 ${i < reached ? 'bg-[#4edea3]' : 'bg-[#353437]'}`} />
                      )}
                    </div>
                    <div className="flex flex-col pb-4">
                      <span className={`text-[13px] font-semibold ${done ? 'text-[#e5e1e4]' : 'text-[#958ea0]'}`}>
                        {step.label}
                      </span>
                      {done && at && <span className="text-[11px] text-[#958ea0]">{formatOrderDate(at)}</span>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {order.status === 'pending' && (
            <PendingOrderActions
              orderId={order.id}
              eventId={order.event_id}
              expiresAt={order.expires_at}
              method={order.payment_method}
            />
          )}

          {(order.status === 'confirmed' || order.status === 'ready') && (
            <Notice tone={order.status === 'ready' ? 'success' : 'info'} icon="qr_code_2">
              Collect at REPC{order.events?.location ? ` (${order.events.location})` : ''} — show your{' '}
              <Link href={`/runner/events/${order.event_id}/bib`} className="font-bold underline underline-offset-2">
                Digital BIB QR
              </Link>{' '}
              and quote <span className="font-mono font-bold">{order.order_number}</span>.
            </Notice>
          )}
        </section>

        {/* Items */}
        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#353437]/60 text-[14px] font-bold text-[#e5e1e4]">Items</div>
          <ul className="divide-y divide-[#353437]/50">
            {order.merch_order_items.map((item) => (
              <li key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[#e5e1e4] truncate">{item.product_name ?? 'Item'}</p>
                  <p className="text-[11px] text-[#958ea0]">
                    {item.variant_label ?? 'One size'} · {item.quantity} × {formatRM(Number(item.unit_price))}
                  </p>
                </div>
                <span className="text-[13px] font-mono font-bold text-[#e5e1e4] whitespace-nowrap">
                  {formatRM(Number(item.unit_price) * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 bg-[#23232b]/50 border-t border-[#353437]/40 flex items-center justify-between">
            <span className="text-[12px] font-bold uppercase tracking-widest text-[#958ea0]">Total</span>
            <span className="text-[18px] font-mono font-extrabold text-[#d0bcff]">{formatRM(Number(order.total_amount))}</span>
          </div>
        </section>

        {/* Payment */}
        {order.paid_at && (
          <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex flex-col gap-2 text-[12px]">
            <span className="text-[14px] font-bold text-[#e5e1e4] mb-1">Payment</span>
            <div className="flex justify-between gap-3">
              <span className="text-[#958ea0]">Method</span>
              <span className="text-[#e5e1e4]">
                {order.payment_method ? MERCH_PAYMENT_METHOD_LABEL[order.payment_method] : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#958ea0]">Paid</span>
              <span className="text-[#e5e1e4]">{formatOrderDate(order.paid_at)}</span>
            </div>
            {order.payment_ref && (
              <div className="flex justify-between gap-3">
                <span className="text-[#958ea0]">Reference</span>
                <span className="font-mono text-[#e5e1e4] truncate">{order.payment_ref}</span>
              </div>
            )}
          </section>
        )}

        {justPaid && (
          <Link
            href="/runner/merch"
            className="w-full py-3.5 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[14px] font-bold text-center"
          >
            View all my orders
          </Link>
        )}
      </div>
    </div>
  )
}
