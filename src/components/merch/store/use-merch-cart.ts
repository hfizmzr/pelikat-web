'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { MERCH_MAX_QTY_PER_ITEM, type MerchCartLine } from '@/lib/merch'

// One cart per event, persisted in localStorage so it survives closing the PWA.
// localStorage can be missing or throw (private mode, blocked storage), so the
// in-memory copy is the source of truth and storage is best effort.

const EMPTY: MerchCartLine[] = []
const carts = new Map<string, MerchCartLine[]>()
const listeners = new Set<() => void>()

const storageKey = (eventId: string) => `pelikat:merch-cart:${eventId}`

function isCartLine(value: unknown): value is MerchCartLine {
  const line = value as MerchCartLine
  return (
    typeof line?.variantId === 'string' &&
    typeof line.productId === 'string' &&
    typeof line.name === 'string' &&
    typeof line.price === 'number' &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0
  )
}

function load(eventId: string): MerchCartLine[] {
  const cached = carts.get(eventId)
  if (cached) return cached

  let lines = EMPTY
  try {
    const raw = window.localStorage.getItem(storageKey(eventId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) lines = parsed.filter(isCartLine)
  } catch {
    // ignore unreadable storage
  }
  carts.set(eventId, lines)
  return lines
}

function save(eventId: string, lines: MerchCartLine[]) {
  carts.set(eventId, lines)
  try {
    if (lines.length === 0) window.localStorage.removeItem(storageKey(eventId))
    else window.localStorage.setItem(storageKey(eventId), JSON.stringify(lines))
  } catch {
    // keep the in-memory cart
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (!e.key?.startsWith('pelikat:merch-cart:')) return
    carts.delete(e.key.slice('pelikat:merch-cart:'.length))
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function clearMerchCart(eventId: string) {
  save(eventId, EMPTY)
}

export function useMerchCart(eventId: string) {
  const lines = useSyncExternalStore(
    subscribe,
    () => load(eventId),
    () => EMPTY
  )

  const add = useCallback(
    (line: MerchCartLine) => {
      const current = load(eventId)
      const existing = current.find((l) => l.variantId === line.variantId)
      const next = existing
        ? current.map((l) =>
            l.variantId === line.variantId
              ? { ...line, quantity: Math.min(l.quantity + line.quantity, MERCH_MAX_QTY_PER_ITEM) }
              : l
          )
        : [...current, { ...line, quantity: Math.min(line.quantity, MERCH_MAX_QTY_PER_ITEM) }]
      save(eventId, next)
    },
    [eventId]
  )

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      const current = load(eventId)
      const next =
        quantity <= 0
          ? current.filter((l) => l.variantId !== variantId)
          : current.map((l) =>
              l.variantId === variantId ? { ...l, quantity: Math.min(quantity, MERCH_MAX_QTY_PER_ITEM) } : l
            )
      save(eventId, next)
    },
    [eventId]
  )

  const remove = useCallback((variantId: string) => setQuantity(variantId, 0), [setQuantity])
  const clear = useCallback(() => clearMerchCart(eventId), [eventId])

  const summary = useMemo(
    () => ({
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal: lines.reduce((sum, l) => sum + l.quantity * l.price, 0),
    }),
    [lines]
  )

  return { lines, ...summary, add, setQuantity, remove, clear }
}
