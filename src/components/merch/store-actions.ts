'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth/requireUser'
import type { MerchPaymentMethod } from '@/lib/merch'
import { getPaymentGateway } from '@/lib/payments/gateway'
import type { MerchActionResult } from './actions'

function revalidateRunnerMerch(eventId: string, orderId?: string) {
  revalidatePath('/runner/merch')
  revalidatePath(`/runner/events/${eventId}/merch`)
  if (orderId) revalidatePath(`/runner/merch/orders/${orderId}`)
  revalidatePath('/organizer/merch')
  revalidatePath('/organizer/mobile/merch')
}

export type StartCheckoutInput = {
  eventId: string
  items: { variantId: string; quantity: number }[]
  method: MerchPaymentMethod
}

// FR-70/71: turn the cart into a pending order (stock reserved for 15 min)
// and hand back the gateway page to pay on.
export async function startMerchCheckout(
  input: StartCheckoutInput
): Promise<MerchActionResult<{ orderId: string; redirectUrl: string }>> {
  const { supabase } = await requireAuth()

  const { data, error } = await supabase.rpc('merch_checkout', {
    p_event_id: input.eventId,
    p_items: input.items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
    p_payment_method: input.method,
  })

  if (error) return { ok: false, error: error.message }

  const order = (data as { order_id: string; order_number: string; total_amount: number }[] | null)?.[0]
  if (!order) return { ok: false, error: 'Could not create your order.' }

  revalidateRunnerMerch(input.eventId)

  try {
    const { redirectUrl } = await getPaymentGateway().createPayment({
      orderId: order.order_id,
      orderNumber: order.order_number,
      amount: Number(order.total_amount),
      method: input.method,
      description: `Pelikat merch order ${order.order_number}`,
    })
    return { ok: true, data: { orderId: order.order_id, redirectUrl } }
  } catch (e) {
    console.error('createPayment failed:', e)
    // The order stays pending; the runner can retry from their order page
    return { ok: false, error: 'Could not reach the payment gateway. Try again from your order.' }
  }
}

export async function cancelMerchCheckout(orderId: string): Promise<MerchActionResult> {
  const { supabase } = await requireAuth()

  const { data: order } = await supabase
    .from('merch_orders')
    .select('event_id')
    .eq('id', orderId)
    .maybeSingle()

  const { data, error } = await supabase.rpc('merch_cancel_checkout', { p_order_id: orderId })

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'This order can no longer be cancelled.' }

  if (order) revalidateRunnerMerch(order.event_id, orderId)
  return { ok: true, data: undefined }
}
