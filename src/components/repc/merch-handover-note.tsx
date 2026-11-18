import { ShoppingBag } from 'lucide-react'
import type { MerchHandover } from '@/lib/repc'

function formatOrders(orders: MerchHandover['collected']) {
  return orders
    .map((order) => `${order.orderNumber} (${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'})`)
    .join(', ')
}

/**
 * What staff must hand over at kit collection. A successful check-in also
 * marks the runner's ready merch orders collected (same transaction), so this
 * has to be shown wherever a check-in result is: desktop and mobile scanner.
 */
export function MerchHandoverNote({ merch, className }: { merch: MerchHandover; className?: string }) {
  if (merch.collected.length === 0 && merch.notPacked.length === 0) return null

  return (
    <div className={className ?? 'mt-2 flex items-start gap-2 rounded-md border border-current/20 px-2 py-1.5 text-sm'}>
      <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {merch.collected.length > 0 && (
          <p>
            <span className="font-medium">Hand over merch:</span> {formatOrders(merch.collected)}
          </p>
        )}
        {merch.notPacked.length > 0 && (
          <p className="text-warning">
            <span className="font-medium">Paid, not packed yet:</span> {formatOrders(merch.notPacked)}
          </p>
        )}
      </div>
    </div>
  )
}
