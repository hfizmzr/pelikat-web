'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth/requireUser'
import { DjangoApiError, fetchDjangoApi } from '@/lib/django'
import type { MerchPaymentMethod } from '@/lib/merch'
import type { MerchActionResult } from './actions'

// HitPay checkout must return to the public app (never localhost) — the
// same rule as the registration/subscription funnels.
function hitpayRedirectUrl(path: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_TUNNEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  return `${appUrl}${path}`
}

const CHECKOUT_INITIALIZING =
  'Your previous payment attempt is still being initialized — please retry in a few seconds.'
const CHECKOUT_GENERIC_ERROR =
  'Could not start the payment. Please try again or contact support.'

function checkoutError(e: unknown): string {
  // Same error mapping as the other HitPay funnels: 409 = the earlier
  // attempt is still initializing the claim slot (a retry gets that same
  // checkout); anything else is logged server-side and mapped to a
  // detail-free retryable message.
  if (e instanceof DjangoApiError && e.status === 409) return CHECKOUT_INITIALIZING
  return CHECKOUT_GENERIC_ERROR
}

// HitPay PR creation shared by start/resume — Django is authoritative for
// the amount (it re-reads merch_order_items server-side and ignores the
// caller's number), so the caller's total is only a sanity snapshot.
async function createMerchPaymentRequest(
  orderId: string,
  orderNumber: string,
  amount: number,
  user: { email?: string },
  profile: { id: string; full_name: string | null } | null
): Promise<string> {
  const result: { checkout_url: string } = await fetchDjangoApi('/payments/create', {
    method: 'POST',
    body: JSON.stringify({
      order_type: 'merch',
      merch_order_id: orderId,
      runner_id: profile?.id,
      amount: amount,
      email: user.email,
      name: profile?.full_name || user.email || 'Pelikat runner',
      purpose: `Pelikat merch order ${orderNumber}`,
      redirect_url: hitpayRedirectUrl(`/runner/merch/orders/${orderId}`),
    }),
  })
  return result.checkout_url
}

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

// FR-70/71: turn the cart into a pending order (stock reserved for 15 min),
// then hand back the HitPay hosted-checkout URL to pay on — created
// through the Django /payments/create funnel exactly like the
// registration/subscription flows.
export async function startMerchCheckout(
  input: StartCheckoutInput
): Promise<MerchActionResult<{ orderId: string; checkoutUrl: string }>> {
  const { supabase, user } = await requireAuth()

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
    const { data: profile } = await supabase
      .from('runner_profiles')
      .select('id, full_name')
      .eq('user_id', user.id)
      .single()

    const checkoutUrl = await createMerchPaymentRequest(
      order.order_id, order.order_number, Number(order.total_amount), user, profile)
    return { ok: true, data: { orderId: order.order_id, checkoutUrl } }
  } catch (e) {
    console.error('merch HitPay checkout failed:', e)
    // merch_checkout already reserved stock in this pending order — carry
    // its id so the retry routes to that order and resumes payment for
    // it (resumeMerchCheckout never creates a second order).
    return { ok: false, error: checkoutError(e), orderId: order.order_id }
  }
}

// Resume payment for an existing pending merch order: /payments/create
// reuses that order's pending HitPay PR (M1 claim-slot reuse) — it never
// creates a second order or a second PR. Used by the runner order page's
// "Continue to payment" (the pending-orders retry path).
export async function resumeMerchCheckout(
  orderId: string
): Promise<MerchActionResult<{ checkoutUrl: string }>> {
  const { supabase, user } = await requireAuth()

  const { data: order } = await supabase
    .from('merch_orders')
    .select('id, order_number, total_amount, status')
    .eq('id', orderId)
    .maybeSingle()

  const pending = order as { id: string; order_number: string; total_amount: number; status: string } | null
  if (!pending || pending.status !== 'pending') {
    return { ok: false, error: 'This order is no longer awaiting payment.' }
  }

  try {
    const { data: profile } = await supabase
      .from('runner_profiles')
      .select('id, full_name')
      .eq('user_id', user.id)
      .single()

    const checkoutUrl = await createMerchPaymentRequest(orderId, pending.order_number, Number(pending.total_amount), user, profile)
    return { ok: true, data: { checkoutUrl } }
  } catch (e) {
    console.error('merch HitPay checkout resume failed:', e)
    return { ok: false, error: checkoutError(e) }
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
