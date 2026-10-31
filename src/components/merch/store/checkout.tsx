'use client'

import { CalendarX, CircleAlert, CreditCard, Landmark, LoaderCircle, Lock, ShoppingCart, Store, Trash2, type LucideIcon } from "lucide-react"
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

const PAYMENT_OPTIONS: { method: MerchPaymentMethod; icon: LucideIcon; hint: string }[] = [
  { method: 'fpx', icon: Landmark, hint: 'Maybank2u, CIMB Clicks, Public Bank & more' },
  { method: 'card', icon: CreditCard, hint: 'Visa / Mastercard' },
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
        if (result.orderId) {
          // The payment-request POST failed, but merch_checkout already
          // reserved stock in this pending order — the cart must not
          // start a second checkout. Resume the SAME order from its order
          // page ("Continue to payment" there calls resumeMerchCheckout).
          cart.clear()
          router.push(`/runner/merch/orders/${result.orderId}`)
        }
        router.refresh()
        return
      }
      // Items are now reserved in the pending order — the cart's job is
      // done. HitPay hosted checkout is off-app: full navigation (never a
      // client-side route). Confirmation is webhook-driven; the redirect
      // back lands on the order details page.
      cart.clear()
      window.location.href = result.data.checkoutUrl
    })
  }

  if (cart.lines.length === 0) {
    return (
      <div className="px-5 py-10 flex flex-col items-center text-center gap-3">
        <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center border border-border/60">
          <ShoppingCart className="size-[32px] text-muted-foreground" />
        </div>
        <p className="text-[15px] font-bold text-foreground">Your cart is empty</p>
        <Link
          href={`/runner/events/${event.id}/merch`}
          className="mt-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold"
        >
          Browse merch
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col px-5 py-5 gap-5">
      {/* Cart */}
      <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="text-[14px] font-bold text-foreground">Your cart</span>
          <Link href={`/runner/events/${event.id}/merch`} className="text-[12px] font-semibold text-primary">
            Add more
          </Link>
        </div>
        <ul className="divide-y divide-border/50">
          {lines.map((line) => (
            <li key={line.variantId} className="p-4 flex gap-3">
              <ProductThumb imagePath={line.imagePath} name={line.name} className="w-14 h-14 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-foreground leading-tight truncate">{line.name}</p>
                    <p className="text-[11px] text-muted-foreground">{line.variantLabel}</p>
                  </div>
                  <span className="text-[13px] font-mono font-bold text-foreground whitespace-nowrap">
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
                    className="text-[12px] font-semibold text-muted-foreground flex items-center gap-1 py-1"
                  >
                    <Trash2 className="size-[16px]" />
                    Remove
                  </button>
                </div>
                {line.problem && (
                  <p className="text-[12px] font-semibold text-red-500 dark:text-red-300">
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
      <section className="bg-card rounded-2xl border border-border/60 p-4 flex gap-3">
        <Store className="size-[22px] text-success" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-foreground">Collect at REPC</span>
          <span className="text-[12px] text-muted-foreground leading-[18px]">
            Pick up your order with your race kit{event.location ? ` (${event.location})` : ''}. Show your Digital
            BIB QR at the counter.
          </span>
        </div>
      </section>

      {/* Payment method */}
      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">Pay with</span>
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
                  active ? 'bg-primary/10 border-primary' : 'bg-card border-border/60'
                }`}
              >
                <option.icon className={`size-[22px] ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="flex-1 flex flex-col">
                  <span className="text-[14px] font-bold text-foreground">{MERCH_PAYMENT_METHOD_LABEL[option.method]}</span>
                  <span className="text-[11px] text-muted-foreground">{option.hint}</span>
                </span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    active ? 'border-primary' : 'border-border'
                  }`}
                >
                  {active && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Total + pay */}
      <section className="bg-card rounded-2xl border border-border/60 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-bold text-foreground">Total</span>
          <span className="text-[20px] font-mono font-extrabold text-primary">{formatRM(total)}</span>
        </div>

        {salesClosed ? (
          <Notice tone="warn" icon={CalendarX}>
            Merch sales for this event have closed.
          </Notice>
        ) : !registrationPaid ? (
          <Notice tone="warn" icon={Lock}>
            <Link href={`/runner/events/${event.id}/payment`} className="font-bold underline underline-offset-2">
              Complete your race registration payment
            </Link>{' '}
            before buying merch.
          </Notice>
        ) : hasProblems ? (
          <Notice tone="error" icon={CircleAlert}>
            Some items changed since you added them. Update or remove them to continue.
          </Notice>
        ) : null}

        {error && (
          <Notice tone="error" icon={CircleAlert}>
            {error}
          </Notice>
        )}

        <button
          type="button"
          onClick={placeOrder}
          disabled={!canPay}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
        >
          {isPending ? (
            <>
              <LoaderCircle className="size-[18px] animate-spin" />
              Reserving your items…
            </>
          ) : (
            <>
              <Lock className="size-[18px]" />
              Proceed to payment
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground text-center -mt-1">
          Items are held for {MERCH_RESERVATION_MINUTES} minutes while you pay.
        </p>
      </section>
    </div>
  )
}
