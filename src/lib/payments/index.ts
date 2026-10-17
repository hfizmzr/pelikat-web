// ── Payment provider entry point ────────────────────────────────
// Barrel for lib/payments. The gate (getPaymentProvider) lives in
// ./mock so single-source-of-truth is preserved; 'hitpay' is accepted
// by the gate but never flows through createCheckout/confirmPayment —
// hitpay checkout is created server-side (Django /payments/* funnel),
// and confirmation only ever arrives via the signed webhook.

export {
  getPaymentProvider,
  getServerPaymentProvider,
  createCheckout,
  confirmPayment,
  type PaymentProvider,
  type CheckoutInput,
  type CheckoutSession,
  type PaymentConfirmation,
} from './mock'
