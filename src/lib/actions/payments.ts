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

  // Auth is still required (JWT client also powers the ownership check).
  const { supabase, user } = await requireAuth()

  // Migration 061 contract: the RPC no longer does the auth.uid() ownership
  // check (it runs as service role), so enforce it here with the caller's
  // JWT client before touching financial rows.
  const [{ data: profile }, { data: registration }] = await Promise.all([
    supabase
      .from('runner_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('registrations')
      .select('runner_id')
      .eq('id', registrationId)
      .maybeSingle(),
  ])
  if (!profile || !registration || profile.id !== registration.runner_id) {
    throw new Error('Not your registration')
  }

  // Migration 060 revoked `authenticated` execute on confirm_dummy_payment
  // and granted service_role; this is the only call path left.
  const { error } = await supabaseAdmin.rpc('confirm_dummy_payment', {
    p_registration_id: registrationId,
  })

  if (error) throw new Error(error.message)
}
