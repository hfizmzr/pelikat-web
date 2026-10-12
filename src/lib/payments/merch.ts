import type { SupabaseClient } from '@supabase/supabase-js'
import type { MerchPaymentMethod } from '@/lib/merch'

// pending → confirmed once the gateway reports a successful payment.
// merch_confirm_payment() is granted to the service role alone, so `admin`
// must be the service-role client (only API routes may import it) and a
// runner's browser can never mark their own order as paid.
// Safe to call twice with the same reference (gateway webhook retries).
export async function confirmMerchOrderPayment(
  admin: SupabaseClient,
  orderId: string,
  paymentRef: string,
  method: MerchPaymentMethod
): Promise<{ ok: true; orderNumber: string } | { ok: false; error: string }> {
  const { data, error } = await admin.rpc('merch_confirm_payment', {
    p_order_id: orderId,
    p_payment_ref: paymentRef,
    p_payment_method: method,
  })

  if (error) return { ok: false, error: error.message }

  const row = (data as { order_number: string; status: string }[] | null)?.[0]
  if (!row) return { ok: false, error: 'Payment could not be confirmed.' }

  return { ok: true, orderNumber: row.order_number }
}
