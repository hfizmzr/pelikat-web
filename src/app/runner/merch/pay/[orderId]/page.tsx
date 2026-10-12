import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { RUNNER_MERCH_ORDER_SELECT, type MerchPaymentMethod, type RunnerMerchOrder } from '@/lib/merch'
import { SimulatedGateway } from '@/components/merch/store/simulated-gateway'

export const metadata: Metadata = {
  title: 'Payment - Pelikat',
  description: 'Pay for your merch order',
}

export default async function MerchPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ method?: string }>
}) {
  const [{ orderId }, { method }, supabase] = await Promise.all([params, searchParams, createClient()])

  // RLS: runners only see their own orders
  const { data } = await supabase
    .from('merch_orders')
    .select(RUNNER_MERCH_ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle()

  const order = data as RunnerMerchOrder | null
  if (!order) notFound()
  if (order.status !== 'pending') redirect(`/runner/merch/orders/${order.id}`)

  const initialMethod: MerchPaymentMethod =
    method === 'card' || method === 'fpx' ? method : order.payment_method ?? 'fpx'

  return <SimulatedGateway order={order} initialMethod={initialMethod} />
}
