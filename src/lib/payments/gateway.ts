import type { MerchPaymentMethod } from '@/lib/merch'
import { simulatedGateway } from './simulated'

export type CreatePaymentInput = {
  orderId: string
  orderNumber: string
  amount: number // RM
  method: MerchPaymentMethod
  description: string
}

export type CreatePaymentResult = {
  // Where to send the runner to pay (the gateway's hosted page)
  redirectUrl: string
}

// A payment provider for merch checkout (FR-71).
//
// To add a real gateway (Stripe, Billplz, ToyyibPay, …):
//   1. implement createPayment() to open a payment session and return its hosted URL
//   2. add a webhook route that verifies the provider's signature and calls
//      confirmMerchOrderPayment() from '@/lib/payments/merch' on success
//   3. return it from getPaymentGateway() when PAYMENT_GATEWAY names it
export interface PaymentGateway {
  id: string
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
}

export function getPaymentGateway(): PaymentGateway {
  switch (process.env.PAYMENT_GATEWAY ?? 'simulated') {
    case 'simulated':
      return simulatedGateway
    default:
      throw new Error(`Unknown PAYMENT_GATEWAY: ${process.env.PAYMENT_GATEWAY}`)
  }
}
