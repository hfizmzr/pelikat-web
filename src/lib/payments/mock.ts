// ── Payment provider abstraction (MOCK/STUB) ────────────────────
// The final gateway has not been chosen. This module is the single
// swap point: when a real provider lands, implement the same two
// functions in lib/payments/<provider>.ts and switch PAYMENT_PROVIDER.
//
// Gate: PAYMENT_PROVIDER env var (NEXT_PUBLIC_PAYMENT_PROVIDER on the
// client). Only 'mock' is implemented; anything else throws loudly
// instead of silently faking a real charge.

export interface CheckoutInput {
  amount: number
  /** ISO 4217, defaults to MYR (RM) */
  currency?: string
  description: string
  /** App-side id tied to this payment (registration id, organizer id, ...) */
  referenceId: string
  metadata?: Record<string, string>
}

export interface CheckoutSession {
  provider: 'mock'
  reference: string
  /** Mock flow: the in-app confirmation happens without redirect */
  checkoutUrl: string
  amount: number
  currency: string
}

export interface PaymentConfirmation {
  provider: 'mock'
  reference: string
  status: 'paid'
  paidAt: string
}

export type PaymentProvider = 'mock' | 'hitpay'

export function getPaymentProvider(): PaymentProvider {
  const provider =
    process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ??
    process.env.PAYMENT_PROVIDER ??
    'mock'

  if (provider !== 'mock' && provider !== 'hitpay') {
    throw new Error(
      `Payment provider "${provider}" is not implemented yet. ` +
        `Add lib/payments/${provider}.ts with createCheckout/confirmPayment ` +
        `and register it in getPaymentProvider().`
    )
  }
  return provider
}

export async function createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
  if (getPaymentProvider() !== 'mock') {
    throw new Error(
      'createCheckout is the mock flow; the hitpay provider creates its ' +
        'checkout server-side (Django /payments/create funnel).'
    )
  }

  const reference = `mock_${input.referenceId.slice(0, 8)}_${crypto.randomUUID().slice(0, 8)}`

  return {
    provider: 'mock',
    reference,
    checkoutUrl: `/mock-checkout/${reference}`,
    amount: input.amount,
    currency: input.currency ?? 'MYR',
  }
}

export async function confirmPayment(
  session: Pick<CheckoutSession, 'reference'>
): Promise<PaymentConfirmation> {
  if (getPaymentProvider() !== 'mock') {
    throw new Error(
      'confirmPayment is the mock flow; hitpay payments are confirmed ' +
        'server-side via the signed webhook only.'
    )
  }

  return {
    provider: 'mock',
    reference: session.reference,
    status: 'paid',
    paidAt: new Date().toISOString(),
  }
}
