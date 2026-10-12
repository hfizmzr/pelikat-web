'use client'

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
  'w-full h-12 px-4 rounded-xl bg-[#131315] border border-[#494454] text-[15px] text-[#e5e1e4] placeholder:text-[#5a5560] outline-none focus:border-[#d0bcff] font-mono'

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
    <div className="flex flex-col w-full min-h-full bg-[#0e0e10]">
      {/* Gateway chrome — deliberately different from the app so it reads as a separate payment page */}
      <header className="sticky top-0 z-40 bg-[#0e0e10]/95 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center justify-between h-14 px-5 pt-safe">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#4edea3]">verified_user</span>
            <span className="text-[15px] font-extrabold text-[#e5e1e4] tracking-tight">Pelikat Pay</span>
            <span className="px-1.5 py-0.5 rounded bg-[#ffb86b]/15 text-[#ffb86b] text-[9px] font-bold uppercase tracking-wider">
              Sandbox
            </span>
          </div>
          <span className="flex items-center gap-1 text-[12px] text-[#cbc3d7]" aria-live="polite">
            <span className="material-symbols-outlined text-[16px]">timer</span>
            <span className="font-mono tabular-nums">
              {remainingMs === null ? '--:--' : formatCountdown(remainingMs)}
            </span>
          </span>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-5">
        {/* Amount */}
        <section className="flex flex-col items-center text-center gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#958ea0]">Amount to pay</span>
          <span className="text-[32px] font-mono font-extrabold text-[#e5e1e4] tracking-tight">{amount}</span>
          <span className="text-[12px] text-[#958ea0]">
            Order <span className="font-mono text-[#cbc3d7]">{order.order_number}</span>
            {order.events?.name ? ` · ${order.events.name}` : ''}
          </span>
        </section>

        {expired ? (
          <section className="flex flex-col gap-4">
            <Notice tone="error" icon="timer_off">
              Your reservation has expired and the items were released. Please check out again.
            </Notice>
            <Link
              href={storeHref}
              className="w-full py-3.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold text-center"
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
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1c1b1d] border border-[#353437]/60">
              {(['fpx', 'card'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMethod(m)
                    setError(null)
                  }}
                  className={`py-2.5 rounded-lg text-[13px] font-bold transition-colors ${
                    method === m ? 'bg-[#2a2a2c] text-[#e5e1e4]' : 'text-[#958ea0]'
                  }`}
                >
                  {m === 'fpx' ? 'FPX' : 'Card'}
                </button>
              ))}
            </div>

            {error && (
              <Notice tone="error" icon="error">
                {error}
              </Notice>
            )}

            {method === 'fpx' ? (
              <section className="flex flex-col gap-3">
                <span className="text-[12px] font-bold text-[#cbc3d7]">{MERCH_PAYMENT_METHOD_LABEL.fpx} — choose your bank</span>
                <div className="grid grid-cols-2 gap-2">
                  {SIMULATED_FPX_BANKS.map((b) => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => setBankCode(b.code)}
                      className={`h-12 px-3 rounded-xl border text-[13px] font-semibold text-left transition-colors ${
                        bankCode === b.code
                          ? 'border-[#d0bcff] bg-[#d0bcff]/10 text-[#e5e1e4]'
                          : 'border-[#353437] bg-[#1c1b1d] text-[#cbc3d7]'
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
                  className="w-full py-3.5 mt-1 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold disabled:opacity-40"
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
                  <span className="text-[12px] font-bold text-[#cbc3d7]">Card number</span>
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
                    <span className="text-[12px] font-bold text-[#cbc3d7]">Expiry</span>
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
                    <span className="text-[12px] font-bold text-[#cbc3d7]">CVC</span>
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
                  <span className="text-[12px] font-bold text-[#cbc3d7]">Name on card</span>
                  <input
                    className={`${inputClass} font-sans`}
                    autoComplete="cc-name"
                    value={card.name}
                    onChange={(e) => setCard({ ...card, name: e.target.value })}
                  />
                </label>

                <details className="rounded-xl bg-[#1c1b1d] border border-[#353437]/60 px-4 py-3 text-[12px] text-[#958ea0]">
                  <summary className="cursor-pointer font-semibold text-[#cbc3d7]">Sandbox test cards</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {SIMULATED_TEST_CARDS.map((c) => (
                      <li key={c.number} className="flex justify-between gap-2">
                        <button
                          type="button"
                          className="font-mono text-[#d0bcff]"
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
                  className="w-full py-3.5 mt-1 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
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
              className="text-[13px] font-semibold text-[#958ea0] py-2 disabled:opacity-50"
            >
              Cancel payment and release items
            </button>
          </>
        )}

        <p className="text-[11px] text-[#5a5560] text-center leading-[16px]">
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
    <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden">
      <div className="px-4 py-3 bg-[#23232b] border-b border-[#353437]/60 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-[#4cd7f6]">account_balance</span>
        <span className="text-[14px] font-bold text-[#e5e1e4]">{bankName}</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">FPX</span>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <p className="text-[13px] text-[#cbc3d7] leading-[20px]">
          Approve a payment of <span className="font-mono font-bold text-[#e5e1e4]">{amount}</span> to{' '}
          <span className="font-bold text-[#e5e1e4]">Pelikat</span>?
        </p>
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="w-full py-3.5 rounded-xl bg-[#4edea3] text-[#003926] text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
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
          className="w-full py-3 rounded-xl border border-[#ffb4ab]/40 text-[#ffb4ab] text-[13px] font-bold disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </section>
  )
}
