'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MERCH_MAX_QTY_PER_ITEM,
  MERCH_PAYMENT_METHOD_LABEL,
  MERCH_RESERVATION_MINUTES,
  formatRM,
  variantLabel,
  type MerchPaymentMethod,
} from '@/lib/merch'
import { startMerchCheckout } from '@/components/merch/store-actions'
import { useMerchCart } from './use-merch-cart'
import { Notice, ProductThumb } from './store-ui'
import { QuantityStepper } from './storefront'
import type { StoreData } from './queries'

type CheckoutLine = {
  variantId: string
  name: string
  variantLabel: string
  imagePath: string | null
  quantity: number
  price: number
  stock: number
  problem: string | null
}

const PAYMENT_OPTIONS: { method: MerchPaymentMethod; icon: string; hint: string }[] = [
  { method: 'fpx', icon: 'account_balance', hint: 'Maybank2u, CIMB Clicks, Public Bank & more' },
  { method: 'card', icon: 'credit_card', hint: 'Visa / Mastercard' },
]

export function Checkout({ data }: { data: StoreData & { event: NonNullable<StoreData['event']> } }) {
  const { event, products, registrationPaid, salesClosed } = data
  const router = useRouter()
  const cart = useMerchCart(event.id)
  const [method, setMethod] = useState<MerchPaymentMethod>('fpx')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Re-check the saved cart against current products: prices may have
  // changed, and items may have been hidden or sold out since it was saved.
  const lines = useMemo<CheckoutLine[]>(() => {
    const variants = new Map(
      products.flatMap((p) => p.merch_variants.map((v) => [v.id, { product: p, variant: v }] as const))
    )
    return cart.lines.map((line) => {
      const live = variants.get(line.variantId)
      if (!live) {
        return { ...line, stock: 0, problem: 'No longer available' }
      }
      const { product, variant } = live
      const stock = variant.stock
      return {
        variantId: line.variantId,
        name: product.name,
        variantLabel: variantLabel(variant),
        imagePath: product.image_path,
        quantity: line.quantity,
        price: product.price,
        stock,
        problem: stock <= 0 ? 'Sold out' : line.quantity > stock ? `Only ${stock} left` : null,
      }
    })
  }, [cart.lines, products])

  const payable = lines.filter((l) => !l.problem)
  const total = payable.reduce((sum, l) => sum + l.price * l.quantity, 0)
  const hasProblems = lines.some((l) => l.problem)
  const canPay = registrationPaid && !salesClosed && payable.length > 0 && !hasProblems && !isPending

  function placeOrder() {
    setError(null)
    startTransition(async () => {
      const result = await startMerchCheckout({
        eventId: event.id,
        items: payable.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        method,
      })
      if (!result.ok) {
        setError(result.error)
        router.refresh()
        return
      }
      router.push(result.data.redirectUrl)
    })
  }

  if (cart.lines.length === 0) {
    return (
      <div className="px-5 py-10 flex flex-col items-center text-center gap-3">
        <div className="w-16 h-16 bg-[#1c1b1d] rounded-full flex items-center justify-center border border-[#353437]/60">
          <span className="material-symbols-outlined text-[32px] text-[#958ea0]">shopping_cart</span>
        </div>
        <p className="text-[15px] font-bold text-[#e5e1e4]">Your cart is empty</p>
        <Link
          href={`/runner/events/${event.id}/merch`}
          className="mt-2 px-6 py-3 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold"
        >
          Browse merch
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col px-5 py-5 gap-5">
      {/* Cart */}
      <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#353437]/60 flex items-center justify-between">
          <span className="text-[14px] font-bold text-[#e5e1e4]">Your cart</span>
          <Link href={`/runner/events/${event.id}/merch`} className="text-[12px] font-semibold text-[#d0bcff]">
            Add more
          </Link>
        </div>
        <ul className="divide-y divide-[#353437]/50">
          {lines.map((line) => (
            <li key={line.variantId} className="p-4 flex gap-3">
              <ProductThumb imagePath={line.imagePath} name={line.name} className="w-14 h-14 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#e5e1e4] leading-tight truncate">{line.name}</p>
                    <p className="text-[11px] text-[#958ea0]">{line.variantLabel}</p>
                  </div>
                  <span className="text-[13px] font-mono font-bold text-[#e5e1e4] whitespace-nowrap">
                    {formatRM(line.price * line.quantity)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {line.stock > 0 ? (
                    <QuantityStepper
                      value={Math.min(line.quantity, Math.max(line.stock, 1))}
                      max={Math.min(line.stock, MERCH_MAX_QTY_PER_ITEM)}
                      onChange={(q) => cart.setQuantity(line.variantId, q)}
                      disabled={isPending}
                    />
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => cart.remove(line.variantId)}
                    disabled={isPending}
                    className="text-[12px] font-semibold text-[#958ea0] flex items-center gap-1 py-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    Remove
                  </button>
                </div>
                {line.problem && (
                  <p className="text-[12px] font-semibold text-[#ffb4ab]">
                    {line.problem}
                    {line.stock > 0 && line.quantity > line.stock && (
                      <button
                        type="button"
                        className="ml-2 underline underline-offset-2"
                        onClick={() => cart.setQuantity(line.variantId, line.stock)}
                      >
                        Use {line.stock}
                      </button>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Collection */}
      <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex gap-3">
        <span className="material-symbols-outlined text-[22px] text-[#4edea3]">storefront</span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-[#e5e1e4]">Collect at REPC</span>
          <span className="text-[12px] text-[#958ea0] leading-[18px]">
            Pick up your order with your race kit{event.location ? ` (${event.location})` : ''}. Show your Digital
            BIB QR at the counter.
          </span>
        </div>
      </section>

      {/* Payment method */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#958ea0] px-1">Pay with</span>
        <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-2">
          {PAYMENT_OPTIONS.map((option) => {
            const active = method === option.method
            return (
              <button
                key={option.method}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMethod(option.method)}
                className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-colors ${
                  active ? 'bg-[#d0bcff]/10 border-[#d0bcff]' : 'bg-[#1c1b1d] border-[#353437]/60'
                }`}
              >
                <span className={`material-symbols-outlined text-[22px] ${active ? 'text-[#d0bcff]' : 'text-[#cbc3d7]'}`}>
                  {option.icon}
                </span>
                <span className="flex-1 flex flex-col">
                  <span className="text-[14px] font-bold text-[#e5e1e4]">{MERCH_PAYMENT_METHOD_LABEL[option.method]}</span>
                  <span className="text-[11px] text-[#958ea0]">{option.hint}</span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    active ? 'border-[#d0bcff]' : 'border-[#494454]'
                  }`}
                >
                  {active && <span className="w-2.5 h-2.5 rounded-full bg-[#d0bcff]" />}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Total + pay */}
      <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-bold text-[#e5e1e4]">Total</span>
          <span className="text-[20px] font-mono font-extrabold text-[#d0bcff]">{formatRM(total)}</span>
        </div>

        {salesClosed ? (
          <Notice tone="warn" icon="event_busy">
            Merch sales for this event have closed.
          </Notice>
        ) : !registrationPaid ? (
          <Notice tone="warn" icon="lock">
            <Link href={`/runner/events/${event.id}/payment`} className="font-bold underline underline-offset-2">
              Complete your race registration payment
            </Link>{' '}
            before buying merch.
          </Notice>
        ) : hasProblems ? (
          <Notice tone="error" icon="error">
            Some items changed since you added them. Update or remove them to continue.
          </Notice>
        ) : null}

        {error && (
          <Notice tone="error" icon="error">
            {error}
          </Notice>
        )}

        <button
          type="button"
          onClick={placeOrder}
          disabled={!canPay}
          className="w-full py-3.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
        >
          {isPending ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              Reserving your items…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">lock</span>
              Proceed to payment
            </>
          )}
        </button>
        <p className="text-[11px] text-[#958ea0] text-center -mt-1">
          Items are held for {MERCH_RESERVATION_MINUTES} minutes while you pay.
        </p>
      </section>
    </div>
  )
}
