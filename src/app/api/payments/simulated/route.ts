import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { confirmMerchOrderPayment } from '@/lib/payments/merch'
import { simulateCharge, type SimulatedChargeInput } from '@/lib/payments/simulated'

// Sandbox gateway "charge + callback" for merch orders (FR-71).
// The runner submits FPX/card details from /runner/merch/pay/[orderId]; the
// charge is decided by simulateCharge() and, on success, the order is
// confirmed exactly as a real gateway webhook would confirm it.

function parseCharge(body: unknown): SimulatedChargeInput | null {
  const charge = (body as { charge?: Record<string, unknown> })?.charge
  if (charge?.method === 'fpx' && typeof charge.bankCode === 'string' && typeof charge.approve === 'boolean') {
    return { method: 'fpx', bankCode: charge.bankCode, approve: charge.approve }
  }
  if (
    charge?.method === 'card' &&
    typeof charge.cardNumber === 'string' &&
    typeof charge.expiry === 'string' &&
    typeof charge.cvc === 'string'
  ) {
    return { method: 'card', cardNumber: charge.cardNumber, expiry: charge.expiry, cvc: charge.cvc }
  }
  return null
}

export async function POST(request: Request) {
  if ((process.env.PAYMENT_GATEWAY ?? 'simulated') !== 'simulated') {
    return NextResponse.json({ ok: false, error: 'Sandbox payments are disabled.' }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Please log in again.' }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const orderId = (body as { orderId?: unknown })?.orderId
  const charge = parseCharge(body)

  if (typeof orderId !== 'string' || !charge) {
    return NextResponse.json({ ok: false, error: 'Invalid payment request.' }, { status: 400 })
  }

  // Read with the runner's own client: RLS limits this to their orders
  const { data: order } = await supabase
    .from('merch_orders')
    .select('id, status, event_id, expires_at')
    .eq('id', orderId)
    .maybeSingle()

  if (!order) {
    return NextResponse.json({ ok: false, error: 'Order not found.' }, { status: 404 })
  }
  if (order.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'This order is no longer awaiting payment.' })
  }
  if (order.expires_at && new Date(order.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: 'Your reservation has expired. Please check out again.' })
  }

  const result = simulateCharge(charge)
  if (!result.ok) {
    return NextResponse.json(result)
  }

  const confirmed = await confirmMerchOrderPayment(supabaseAdmin, order.id, result.reference, charge.method)
  if (!confirmed.ok) {
    console.error('merch_confirm_payment failed:', { orderId: order.id, error: confirmed.error })
    return NextResponse.json(confirmed)
  }

  revalidatePath('/runner/merch')
  revalidatePath(`/runner/merch/orders/${order.id}`)
  revalidatePath(`/runner/events/${order.event_id}/merch`)
  revalidatePath('/organizer/merch')
  revalidatePath('/organizer/mobile/merch')

  return NextResponse.json({ ok: true, orderNumber: confirmed.orderNumber })
}
