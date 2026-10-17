import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  createCheckout,
  confirmPayment,
  getPaymentProvider,
  getServerPaymentProvider,
} from '@/lib/payments/mock'

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf-8')

describe('Reliability: Mock Payment Provider (Phase 3)', () => {
  it('defaults to the mock provider', () => {
    expect(getPaymentProvider()).toBe('mock')
  })

  it('createCheckout returns a mock session bound to the reference id', async () => {
    const session = await createCheckout({
      amount: 99,
      description: 'Pelikat organizer subscription — Org A',
      referenceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      metadata: { type: 'organizer_subscription' },
    })

    expect(session.provider).toBe('mock')
    expect(session.amount).toBe(99)
    expect(session.currency).toBe('MYR')
    expect(session.reference).toMatch(/^mock_aaaaaaaa_[0-9a-f-]{8}$/)
    expect(session.checkoutUrl).toContain(session.reference)
  })

  it('createCheckout defaults amount-less/edge inputs sanely', async () => {
    const session = await createCheckout({
      amount: 0,
      description: 'Free event registration',
      referenceId: 'reg-123',
    })
    expect(session.currency).toBe('MYR')
    expect(session.amount).toBe(0)
  })

  it('confirmPayment marks the session paid', async () => {
    const session = await createCheckout({
      amount: 10,
      description: 'Registration MALE1001 — kl run',
      referenceId: 'reg-abc',
    })
    const confirmation = await confirmPayment(session)

    expect(confirmation.status).toBe('paid')
    expect(confirmation.reference).toBe(session.reference)
    expect(confirmation.provider).toBe('mock')
    expect(new Date(confirmation.paidAt).getTime()).not.toBeNaN()
  })

  it('rejects unimplemented providers loudly instead of faking charges', async () => {
    const prev = process.env.NEXT_PUBLIC_PAYMENT_PROVIDER
    process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = 'stripe'
    try {
      expect(() => getPaymentProvider()).toThrow(/not implemented yet/)
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER
      else process.env.NEXT_PUBLIC_PAYMENT_PROVIDER = prev
    }
  })

  it('server gate reads PAYMENT_PROVIDER only (actions/route handlers)', () => {
    const prev = process.env.PAYMENT_PROVIDER
    try {
      process.env.PAYMENT_PROVIDER = 'hitpay'
      expect(getServerPaymentProvider()).toBe('hitpay')
      process.env.PAYMENT_PROVIDER = 'stripe'
      expect(() => getServerPaymentProvider()).toThrow(/not implemented yet/)
      delete process.env.PAYMENT_PROVIDER
      expect(getServerPaymentProvider()).toBe('mock')
    } finally {
      if (prev === undefined) delete process.env.PAYMENT_PROVIDER
      else process.env.PAYMENT_PROVIDER = prev
    }
  })

  it('client gate stays a NEXT_PUBLIC literal — no PAYMENT_PROVIDER fallback', () => {
    const prev = process.env.PAYMENT_PROVIDER
    try {
      delete process.env.NEXT_PUBLIC_PAYMENT_PROVIDER
      process.env.PAYMENT_PROVIDER = 'hitpay'
      // Fallback was removed: client gate must not read the server var.
      expect(getPaymentProvider()).toBe('mock')
    } finally {
      if (prev === undefined) delete process.env.PAYMENT_PROVIDER
      else process.env.PAYMENT_PROVIDER = prev
    }
  })

  it('dummy confirmation is server-guarded (HIGH-1) — service-role RPC only', () => {
    const impl = read('src', 'lib', 'actions', 'payments.ts')
    expect(impl).toContain("getServerPaymentProvider() !== 'mock'")
    expect(impl).toContain("from '@/lib/supabase/service-role'")
    expect(impl).toContain("rpc('confirm_dummy_payment', {")
    const eventActions = read('src', 'components', 'events', 'actions.ts')
    expect(eventActions).toContain("export { confirmDummyPayment } from '@/lib/actions/payments'")
  })

  it('both payment surfaces route through the module', () => {
    const organizerPage = read('src', 'app', 'organizer', 'payment', 'page.tsx')
    expect(organizerPage).toContain("from '@/lib/payments/mock'")
    expect(organizerPage).toContain('await createCheckout(')
    expect(organizerPage).toContain('await confirmPayment(session)')
    // audit log preserved, now with provider traceability
    expect(organizerPage).toContain("action: 'organizer_subscription_payment'")
    expect(organizerPage).toContain('payment_reference: paymentReference')

    const runnerPage = read('src', 'app', 'runner', 'events', '[id]', 'payment', 'page.tsx')
    expect(runnerPage).toContain("from '@/lib/payments/mock'")
    expect(runnerPage).toContain('await confirmPayment(session)')
    // DB state update unchanged (ownership check + pending→paid + audit via RPC)
    // unified gate: the runner page imports the shared client gate instead
    // of defining a local one
    expect(runnerPage).toContain("import { createCheckout, confirmPayment, getPaymentProvider } from '@/lib/payments/mock'")
    expect(runnerPage).not.toContain('function getPaymentProvider():')
    expect(runnerPage).toContain('await confirmDummyPayment(registration.id)')
  })
})
