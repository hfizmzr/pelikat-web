import type { MerchPaymentMethod } from '@/lib/merch'
import type { PaymentGateway } from './gateway'

// Sandbox gateway: the "hosted payment page" is /runner/merch/pay/[orderId],
// and charges are decided by simulateCharge() below. No money moves.
export const simulatedGateway: PaymentGateway = {
  id: 'simulated',
  async createPayment({ orderId, method }) {
    return { redirectUrl: `/runner/merch/pay/${orderId}?method=${method}` }
  },
}

export const SIMULATED_FPX_BANKS = [
  { code: 'MBB', name: 'Maybank2u' },
  { code: 'CIMB', name: 'CIMB Clicks' },
  { code: 'PBB', name: 'Public Bank' },
  { code: 'RHB', name: 'RHB Now' },
  { code: 'HLB', name: 'Hong Leong Connect' },
  { code: 'AMB', name: 'AmOnline' },
  { code: 'BIMB', name: 'Bank Islam' },
  { code: 'BSN', name: 'BSN' },
] as const

// Any other card number that passes the Luhn check is approved
export const SIMULATED_TEST_CARDS = [
  { number: '4242 4242 4242 4242', result: 'Approved' },
  { number: '4000 0000 0000 0002', result: 'Declined' },
  { number: '4000 0000 0000 9995', result: 'Insufficient funds' },
] as const

export type SimulatedChargeInput =
  | { method: Extract<MerchPaymentMethod, 'fpx'>; bankCode: string; approve: boolean }
  | { method: Extract<MerchPaymentMethod, 'card'>; cardNumber: string; expiry: string; cvc: string }

export type SimulatedChargeResult =
  | { ok: true; reference: string }
  | { ok: false; error: string }

function luhnValid(digits: string) {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

function expiryValid(expiry: string, now: Date) {
  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(expiry.trim())
  if (!match) return false
  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  if (month < 1 || month > 12) return false
  // Valid through the last day of the expiry month
  return new Date(year, month, 1) > now
}

function reference(prefix: string) {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()
  return `SIM-${prefix}-${Date.now().toString(36).toUpperCase()}${random}`
}

export function simulateCharge(input: SimulatedChargeInput, now = new Date()): SimulatedChargeResult {
  if (input.method === 'fpx') {
    const bank = SIMULATED_FPX_BANKS.find((b) => b.code === input.bankCode)
    if (!bank) return { ok: false, error: 'Choose a bank to pay with FPX.' }
    if (!input.approve) return { ok: false, error: `Payment was rejected at ${bank.name}.` }
    return { ok: true, reference: reference(`FPX-${bank.code}`) }
  }

  const digits = input.cardNumber.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) {
    return { ok: false, error: 'Card number is invalid.' }
  }
  if (!expiryValid(input.expiry, now)) return { ok: false, error: 'Card expiry date is invalid or has passed.' }
  if (!/^\d{3,4}$/.test(input.cvc.trim())) return { ok: false, error: 'CVC must be 3 or 4 digits.' }

  if (digits === '4000000000000002') return { ok: false, error: 'Your card was declined.' }
  if (digits === '4000000000009995') return { ok: false, error: 'Your card has insufficient funds.' }

  return { ok: true, reference: reference(`CARD-${digits.slice(-4)}`) }
}
