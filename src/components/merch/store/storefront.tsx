'use client'

import { useState } from 'react'
import Link from 'next/link'
import * as Dialog from '@radix-ui/react-dialog'
import {
  MERCH_MAX_QTY_PER_ITEM,
  formatRM,
  stockLevel,
  variantLabel,
  type MerchVariant,
} from '@/lib/merch'
import { useMerchCart } from './use-merch-cart'
import { Notice, ProductThumb } from './store-ui'
import type { StoreData, StoreProduct } from './queries'

function productStock(product: StoreProduct) {
  return product.merch_variants.reduce((sum, v) => sum + v.stock, 0)
}

export function Storefront({ data }: { data: StoreData & { event: NonNullable<StoreData['event']> } }) {
  const { event, products, registrationPaid, salesClosed } = data
  const cart = useMerchCart(event.id)
  const [selected, setSelected] = useState<StoreProduct | null>(null)

  return (
    <div className="flex flex-col px-5 pt-5 gap-5">
      {salesClosed ? (
        <Notice tone="warn" icon="event_busy">
          Merch sales for this event have closed.
        </Notice>
      ) : !registrationPaid ? (
        <Notice tone="info" icon="info">
          You can browse now. To check out,{' '}
          <Link href={`/runner/events/${event.id}/payment`} className="font-bold underline underline-offset-2">
            complete your race registration payment
          </Link>{' '}
          first.
        </Notice>
      ) : (
        <Notice tone="info" icon="storefront">
          Pay online, then collect your order at REPC (race kit collection) with your Digital BIB.
        </Notice>
      )}

      {products.length === 0 ? (
        <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-[#23232b] rounded-full flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px] text-[#958ea0]">checkroom</span>
          </div>
          <p className="text-[15px] font-bold text-[#e5e1e4] mb-1">No merch yet</p>
          <p className="text-[12px] text-[#958ea0]">The organizer hasn&apos;t listed any merchandise for this event.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {products.map((product) => {
            const stock = productStock(product)
            const level = stockLevel(stock, product.low_stock_threshold)
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelected(product)}
                className="text-left bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden flex flex-col active:scale-[0.98] transition-transform"
              >
                <div className="relative">
                  <ProductThumb imagePath={product.image_path} name={product.name} className="aspect-square w-full" />
                  {level === 'out' && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#131315]/85 text-[10px] font-bold uppercase tracking-wider text-[#ffb4ab]">
                      Sold out
                    </span>
                  )}
                  {level === 'low' && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#131315]/85 text-[10px] font-bold uppercase tracking-wider text-[#ffb86b]">
                      Few left
                    </span>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-[#e5e1e4] leading-tight line-clamp-2">{product.name}</span>
                  <span className="text-[13px] font-mono font-bold text-[#d0bcff]">{formatRM(product.price)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {cart.count > 0 && (
        <div className="sticky bottom-[92px] z-30 mt-2">
          <Link
            href={`/runner/events/${event.id}/merch/checkout`}
            className="flex items-center justify-between gap-3 w-full px-4 py-3.5 rounded-2xl bg-[#d0bcff] text-[#3c0091] shadow-[0_12px_32px_rgba(0,0,0,0.55)] active:scale-[0.98] transition-transform"
          >
            <span className="flex items-center gap-2 text-[13px] font-bold">
              <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
              {cart.count} {cart.count === 1 ? 'item' : 'items'}
            </span>
            <span className="flex items-center gap-1 text-[14px] font-extrabold">
              {formatRM(cart.subtotal)}
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </span>
          </Link>
        </div>
      )}

      <ProductSheet
        product={selected}
        onClose={() => setSelected(null)}
        disabled={salesClosed}
        inCart={(variantId) => cart.lines.find((l) => l.variantId === variantId)?.quantity ?? 0}
        onAdd={(variant, quantity) => {
          if (!selected) return
          cart.add({
            variantId: variant.id,
            productId: selected.id,
            name: selected.name,
            variantLabel: variantLabel(variant),
            price: selected.price,
            imagePath: selected.image_path,
            quantity,
          })
          setSelected(null)
        }}
      />
    </div>
  )
}

function ProductSheet({
  product,
  onClose,
  onAdd,
  inCart,
  disabled,
}: {
  product: StoreProduct | null
  onClose: () => void
  onAdd: (variant: MerchVariant, quantity: number) => void
  inCart: (variantId: string) => number
  disabled: boolean
}) {
  return (
    <Dialog.Root open={!!product} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-[61] mx-auto w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-[#1c1b1d] border-t border-x border-[#353437]/60 pb-safe data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
        >
          {/* key resets the variant/quantity picker for each product */}
          {product && <ProductSheetBody key={product.id} {...{ product, onClose, onAdd, inCart, disabled }} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ProductSheetBody({
  product,
  onClose,
  onAdd,
  inCart,
  disabled,
}: {
  product: StoreProduct
  onClose: () => void
  onAdd: (variant: MerchVariant, quantity: number) => void
  inCart: (variantId: string) => number
  disabled: boolean
}) {
  const variants = product.merch_variants
  const firstAvailable = variants.find((v) => v.stock > 0) ?? null
  const [variantId, setVariantId] = useState<string | null>(
    variants.length === 1 ? variants[0].id : firstAvailable?.id ?? null
  )
  const [quantity, setQuantity] = useState(1)

  const variant = variants.find((v) => v.id === variantId) ?? null
  const alreadyInCart = variant ? inCart(variant.id) : 0
  const maxQty = variant ? Math.max(0, Math.min(variant.stock, MERCH_MAX_QTY_PER_ITEM) - alreadyInCart) : 0
  const qty = Math.min(quantity, Math.max(maxQty, 1))
  const canAdd = !disabled && !!variant && maxQty > 0
  const singleSku = variants.length === 1 && !variants[0].size && !variants[0].color

  function addLabel() {
    if (disabled) return 'Sales closed'
    if (!variant) return firstAvailable ? 'Choose a size' : 'Sold out'
    if (variant.stock <= 0) return 'Sold out'
    if (maxQty === 0) return 'Limit reached'
    return `Add to cart · ${formatRM(product.price * qty)}`
  }

  return (
    <div className="flex flex-col">
      <div className="relative">
        <ProductThumb imagePath={product.image_path} name={product.name} className="aspect-[4/3] w-full" />
        <Dialog.Close
          aria-label="Close"
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-[#131315]/80 text-[#e5e1e4] flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </Dialog.Close>
      </div>

      <div className="p-5 flex flex-col gap-5">
        <div>
          <Dialog.Title className="text-[18px] font-bold text-[#e5e1e4] leading-tight">{product.name}</Dialog.Title>
          <p className="text-[16px] font-mono font-bold text-[#d0bcff] mt-1">{formatRM(product.price)}</p>
          {product.description && (
            <p className="text-[13px] text-[#cbc3d7] mt-3 leading-[20px] whitespace-pre-line">{product.description}</p>
          )}
        </div>

        {!singleSku && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#958ea0]">Choose size / variant</span>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => {
                const out = v.stock <= 0
                const active = v.id === variantId
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={out}
                    onClick={() => {
                      setVariantId(v.id)
                      setQuantity(1)
                    }}
                    className={`min-w-[52px] px-3 py-2 rounded-xl border text-[13px] font-bold transition-colors ${
                      active
                        ? 'bg-[#d0bcff] border-[#d0bcff] text-[#3c0091]'
                        : out
                          ? 'border-[#353437] text-[#5a5560] line-through'
                          : 'border-[#494454] text-[#e5e1e4] active:bg-[#23232b]'
                    }`}
                  >
                    {variantLabel(v)}
                  </button>
                )
              })}
            </div>
            {variant && variant.stock > 0 && variant.stock <= product.low_stock_threshold && (
              <span className="text-[12px] text-[#ffb86b]">Only {variant.stock} left</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#958ea0]">Quantity</span>
          <QuantityStepper value={qty} max={maxQty} onChange={setQuantity} disabled={!canAdd} />
        </div>

        {variant && alreadyInCart > 0 && (
          <p className="text-[12px] text-[#958ea0] -mt-3">
            {alreadyInCart} already in your cart{maxQty === 0 ? ' — that’s the most you can add.' : '.'}
          </p>
        )}

        <button
          type="button"
          disabled={!canAdd}
          onClick={() => variant && onAdd(variant, qty)}
          className="w-full py-3.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
        >
          <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
          {addLabel()}
        </button>
        <button type="button" onClick={onClose} className="text-[13px] font-semibold text-[#958ea0] -mt-2 py-2">
          Keep browsing
        </button>
      </div>
    </div>
  )
}

export function QuantityStepper({
  value,
  max,
  min = 1,
  onChange,
  disabled,
}: {
  value: number
  max: number
  min?: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center rounded-xl border border-[#494454] overflow-hidden">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="w-9 h-9 flex items-center justify-center text-[#e5e1e4] disabled:text-[#5a5560] active:bg-[#23232b]"
      >
        <span className="material-symbols-outlined text-[18px]">remove</span>
      </button>
      <span className="w-9 text-center text-[14px] font-bold font-mono text-[#e5e1e4] tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="w-9 h-9 flex items-center justify-center text-[#e5e1e4] disabled:text-[#5a5560] active:bg-[#23232b]"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
      </button>
    </div>
  )
}
