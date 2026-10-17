'use server'

import { requireAuth } from '@/lib/auth/requireUser'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getServerPaymentProvider } from '@/lib/payments'

// Mock-mode payment confirmation. Lives here (not components/events)
// because it writes financial rows with the service-role client.
export async function confirmDummyPayment(registrationId: string) {
  // This action marks a registration paid without any real charge, so it
  // must be dead unless the server runtime env says provider = 'mock'.
  // Read PAYMENT_PROVIDER (server env), never NEXT_PUBLIC — the browser
  // must not be able to influence this path.
  if (getServerPaymentProvider() !== 'mock') {
    throw new Error(
      'Mock payment confirmation is unavailable: PAYMENT_PROVIDER is not "mock".'
    )
  }

  // Auth is still required even though the RPC runs as service role.
  await requireAuth()

  // Migration 060 revoked `authenticated` execute on confirm_dummy_payment
  // and granted service_role; this is the only call path left.
  const { error } = await supabaseAdmin.rpc('confirm_dummy_payment', {
    p_registration_id: registrationId,
  })

  if (error) throw new Error(error.message)
}
