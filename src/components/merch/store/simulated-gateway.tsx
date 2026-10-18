'use client'

import { CircleAlert, Landmark, LoaderCircle, ShieldCheck, Timer, TimerOff } from "lucide-react"
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MERCH_PAYMENT_METHOD_LABEL,
  formatRM,
  type MerchPaymentMethod,
  type RunnerMerchOrder,
} from '@/lib/merch'
import { SIMULATED_FPX_BANKS, SIMULATED_TEST_CARDS, type SimulatedChargeInput } from '@/lib/payments/simulated'
import { cancelMerchCheckout } from '@/components/merch/store-actions'
import { clearMerchCart } from './use-merch-cart'
import { formatCountdown, useReservationTimer } from './reservation-countdown'
import { Notice } from './store-ui'

type Step = 'details' | 'bank'

function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

const inputClass =
  'w-full h-12 px-4 rounded-xl bg-background border border-border text-[15px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary font-mono'

export function SimulatedGateway({
  order,
  initialMethod,
}: {
  order: RunnerMerchOrder
  initialMethod: MerchPaymentMethod
}) {
  const router = useRouter()
  const [method, setMethod] = useState<MerchPaymentMethod>(initialMethod)
  const [step, setStep] = useState<Step>('details')
  const [bankCode, setBankCode] = useState<string | null>(null)
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', name: '' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { remainingMs, expired } = useReservationTimer(order.expires_at)

  const amount = formatRM(Number(order.total_amount))
  const bank = SIMULATED_FPX_BANKS.find((b) => b.code === bankCode)
  const storeHref = `/runner/events/${order.event_id}/merch`

  function pay(charge: SimulatedChargeInput) {
    setError(null)
    startTransition(async () => {
      let result: { ok: true } | { ok: false; error: string }
      try {
        const response = await fetch('/api/payments/simulated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, charge }),
        })
        result = await response.json()
      } catch {
        result = { ok: false, error: 'Could not reach the payment gateway. Check your connection and try again.' }
      }
      if (!result.ok) {
        setError(result.error)
        setStep('details')
        return
      }
      clearMerchCart(order.event_id)
      router.replace(`/runner/merch/orders/${order.id}?paid=1`)
    })
  }

  function cancel() {
    startTransition(async () => {
      await cancelMerchCheckout(order.id)
      router.replace(storeHref)
    })
  }

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Gateway chrome — deliberately different from the app so it reads as a separate payment page */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center justify-between h-14 px-5 pt-safe">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-[22px] text-success" />
            <span className="text-[15px] font-extrabold text-foreground tracking-tight">Pelikat Pay</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 dark:bg-amber-400/15 text-amber-500 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wider">
              Sandbox
            </span>
          </div>
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground" aria-live="polite">
            <Timer className="size-[16px]" />
            <span className="font-mono tabular-nums">
              {remainingMs === null ? '--:--' : formatCountdown(remainingMs)}
            </span>
          </span>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-5">
        {/* Amount */}
        <section className="flex flex-col items-center text-center gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Amount to pay</span>
          <span className="text-[32px] font-mono font-extrabold text-foreground tracking-tight">{amount}</span>
          <span className="text-[12px] text-muted-foreground">
            Order <span className="font-mono text-muted-foreground">{order.order_number}</span>
            {order.events?.name ? ` · ${order.events.name}` : ''}
          </span>
        </section>

        {expired ? (
          <section className="flex flex-col gap-4">
            <Notice tone="error" icon={TimerOff}>
              Your reservation has expired and the items were released. Please check out again.
            </Notice>
            <Link
              href={storeHref}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold text-center"
            >
              Back to store
            </Link>
          </section>
        ) : step === 'bank' && bank ? (
          <BankApproval
            bankName={bank.name}
            amount={amount}
            busy={isPending}
            onApprove={() => pay({ method: 'fpx', bankCode: bank.code, approve: true })}
            onReject={() => pay({ method: 'fpx', bankCode: bank.code, approve: false })}
          />
        ) : (
          <>
            {/* Method tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border/60">
              {(['fpx', 'card'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMethod(m)
                    setError(null)
                  }}
                  className={`py-2.5 rounded-lg text-[13px] font-bold transition-colors ${
                    method === m ? 'bg-accent text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {m === 'fpx' ? 'FPX' : 'Card'}
                </button>
              ))}
            </div>

            {error && (
              <Notice tone="error" icon={CircleAlert}>
                {error}
              </Notice>
            )}

            {method === 'fpx' ? (
              <section className="flex flex-col gap-3">
                <span className="text-[12px] font-bold text-muted-foreground">{MERCH_PAYMENT_METHOD_LABEL.fpx} — choose your bank</span>
                <div className="grid grid-cols-2 gap-2">
                  {SIMULATED_FPX_BANKS.map((b) => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => setBankCode(b.code)}
                      className={`h-12 px-3 rounded-xl border text-[13px] font-semibold text-left transition-colors ${
                        bankCode === b.code
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card text-muted-foreground'
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!bank || isPending}
                  onClick={() => setStep('bank')}
                  className="w-full py-3.5 mt-1 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold disabled:opacity-40"
                >
                  {bank ? `Continue to ${bank.name}` : 'Choose a bank'}
                </button>
              </section>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  pay({ method: 'card', cardNumber: card.number, expiry: card.expiry, cvc: card.cvc })
                }}
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-muted-foreground">Card number</span>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                    value={card.number}
                    onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                    required
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold text-muted-foreground">Expiry</span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      value={card.expiry}
                      onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold text-muted-foreground">CVC</span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      maxLength={4}
                      value={card.cvc}
                      onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })}
                      required
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-muted-foreground">Name on card</span>
                  <input
                    className={`${inputClass} font-sans`}
                    autoComplete="cc-name"
                    value={card.name}
                    onChange={(e) => setCard({ ...card, name: e.target.value })}
                  />
                </label>

                <details className="rounded-xl bg-card border border-border/60 px-4 py-3 text-[12px] text-muted-foreground">
                  <summary className="cursor-pointer font-semibold text-muted-foreground">Sandbox test cards</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {SIMULATED_TEST_CARDS.map((c) => (
                      <li key={c.number} className="flex justify-between gap-2">
                        <button
                          type="button"
                          className="font-mono text-primary"
                          onClick={() => setCard({ ...card, number: c.number, expiry: card.expiry || '12/30', cvc: card.cvc || '123' })}
                        >
                          {c.number}
                        </button>
                        <span>{c.result}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">Any future expiry and any 3-digit CVC.</p>
                </details>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-3.5 mt-1 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <LoaderCircle className="size-[18px] animate-spin" />
                      Processing…
                    </>
                  ) : (
                    `Pay ${amount}`
                  )}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={cancel}
              disabled={isPending}
              className="text-[13px] font-semibold text-muted-foreground py-2 disabled:opacity-50"
            >
              Cancel payment and release items
            </button>
          </>
        )}

        <p className="text-[11px] text-muted-foreground/50 text-center leading-[16px]">
          Sandbox gateway for testing — no real money is charged.
        </p>
      </div>
    </div>
  )
}

function BankApproval({
  bankName,
  amount,
  busy,
  onApprove,
  onReject,
}: {
  bankName: string
  amount: string
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="px-4 py-3 bg-muted border-b border-border/60 flex items-center gap-2">
        <Landmark className="size-[18px] text-primary" />
        <span className="text-[14px] font-bold text-foreground">{bankName}</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-muted-foreground">FPX</span>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <p className="text-[13px] text-muted-foreground leading-[20px]">
          Approve a payment of <span className="font-mono font-bold text-foreground">{amount}</span> to{' '}
          <span className="font-bold text-foreground">Pelikat</span>?
        </p>
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="w-full py-3.5 rounded-xl bg-success text-emerald-900 text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? (
            <>
              <LoaderCircle className="size-[18px] animate-spin" />
              Processing…
            </>
          ) : (
            'Approve payment'
          )}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="w-full py-3 rounded-xl border border-red-500/40 dark:border-red-300/40 text-red-500 dark:text-red-300 text-[13px] font-bold disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </section>
  )
}
