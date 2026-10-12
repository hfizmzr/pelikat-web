import { describe, it, expect } from 'vitest'
import { simulateCharge } from '@/lib/payments/simulated'

const now = new Date('2026-10-12T00:00:00Z')
const card = (cardNumber: string, expiry = '12/30', cvc = '123') =>
  simulateCharge({ method: 'card', cardNumber, expiry, cvc }, now)

describe('Simulated payment gateway (merch checkout)', () => {
  it('approves the success test card with a reference', () => {
    const result = card('4242 4242 4242 4242')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reference).toMatch(/^SIM-CARD-4242-/)
  })

  it('declines the decline and insufficient-funds test cards', () => {
    expect(card('4000 0000 0000 0002')).toEqual({ ok: false, error: 'Your card was declined.' })
    expect(card('4000000000009995')).toEqual({ ok: false, error: 'Your card has insufficient funds.' })
  })

  it('rejects numbers that fail the Luhn check', () => {
    expect(card('4242 4242 4242 4241').ok).toBe(false)
    expect(card('1234').ok).toBe(false)
  })

  it('rejects expired or malformed expiry dates and bad CVCs', () => {
    expect(card('4242424242424242', '09/26').ok).toBe(false)
    expect(card('4242424242424242', '13/30').ok).toBe(false)
    expect(card('4242424242424242', '1230').ok).toBe(false)
    expect(card('4242424242424242', '12/30', '12').ok).toBe(false)
    // valid through the end of the expiry month
    expect(card('4242424242424242', '10/26').ok).toBe(true)
  })

  it('FPX succeeds when approved at a known bank and fails when rejected', () => {
    const approved = simulateCharge({ method: 'fpx', bankCode: 'MBB', approve: true }, now)
    expect(approved.ok).toBe(true)
    if (approved.ok) expect(approved.reference).toMatch(/^SIM-FPX-MBB-/)

    expect(simulateCharge({ method: 'fpx', bankCode: 'MBB', approve: false }, now)).toEqual({
      ok: false,
      error: 'Payment was rejected at Maybank2u.',
    })
    expect(simulateCharge({ method: 'fpx', bankCode: 'NOPE', approve: true }, now).ok).toBe(false)
  })

  it('gives every successful charge a unique reference', () => {
    const refs = new Set(Array.from({ length: 50 }, () => {
      const r = card('4242424242424242')
      return r.ok ? r.reference : ''
    }))
    expect(refs.size).toBe(50)
  })
})
