'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2, MoreHorizontal, PackageCheck, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { updateMerchOrderStatus } from '@/components/merch/actions'
import {
  MERCH_ORDER_STATUSES,
  MERCH_ORDER_STATUS_META,
  MERCH_STATUS_TRANSITIONS,
  formatRM,
  type MerchOrderStatus,
} from '@/lib/merch'

export type OrderRow = {
  id: string
  orderNumber: string
  status: MerchOrderStatus
  total: number
  createdAt: string
  runnerName: string
  bibNumber: string | null
  items: { label: string; quantity: number }[]
}

const ACTION_LABEL: Record<MerchOrderStatus, string> = {
  pending: 'Mark pending',
  confirmed: 'Undo ready (back to confirmed)',
  ready: 'Mark ready for collection',
  collected: 'Mark collected',
  cancelled: 'Cancel order',
}

function actionLabel(from: MerchOrderStatus, to: MerchOrderStatus) {
  if (from === 'collected' && to === 'ready') return 'Undo collected (back to ready)'
  return ACTION_LABEL[to]
}

type Filter = 'all' | MerchOrderStatus

function StatusBadge({ status }: { status: MerchOrderStatus }) {
  const meta = MERCH_ORDER_STATUS_META[status]
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function OrderTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cancelTarget, setCancelTarget] = useState<string[] | null>(null)

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: orders.length, pending: 0, confirmed: 0, ready: 0, collected: 0, cancelled: 0 }
    for (const order of orders) result[order.status] += 1
    return result
  }, [orders])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((order) => {
      if (filter !== 'all' && order.status !== filter) return false
      if (!q) return true
      return (
        order.orderNumber.toLowerCase().includes(q) ||
        order.runnerName.toLowerCase().includes(q) ||
        (order.bibNumber ?? '').toLowerCase().includes(q)
      )
    })
  }, [orders, filter, query])

  const selectedOrders = orders.filter((o) => selected.has(o.id))
  const selectedReadyable = selectedOrders.filter((o) => o.status === 'confirmed').map((o) => o.id)
  const selectedCollectable = selectedOrders.filter((o) => o.status === 'ready').map((o) => o.id)
  const allVisibleSelected = visible.length > 0 && visible.every((o) => selected.has(o.id))

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAllVisible = () =>
    setSelected((current) => {
      const next = new Set(current)
      if (allVisibleSelected) visible.forEach((o) => next.delete(o.id))
      else visible.forEach((o) => next.add(o.id))
      return next
    })

  const applyStatus = (orderIds: string[], status: MerchOrderStatus) => {
    startTransition(async () => {
      const result = await updateMerchOrderStatus(orderIds, status)
      setCancelTarget(null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const { updated, skipped } = result.data
      const label = MERCH_ORDER_STATUS_META[status].label.toLowerCase()
      toast.success(
        `${updated} order${updated !== 1 ? 's' : ''} marked ${label}` +
          (skipped > 0 ? ` · ${skipped} skipped (status changed)` : '')
      )
      setSelected(new Set())
      router.refresh()
    })
  }

  const requestStatus = (orderIds: string[], status: MerchOrderStatus) => {
    if (status === 'cancelled') setCancelTarget(orderIds)
    else applyStatus(orderIds, status)
  }

  const renderRowActions = (order: OrderRow) => {
    const transitions = MERCH_STATUS_TRANSITIONS[order.status]
    if (transitions.length === 0) return null
    const primary = transitions[0]

    return (
      <div className="flex items-center justify-end gap-1">
        {/* Quick button only for forward moves; undos stay in the menu */}
        {(order.status === 'confirmed' || order.status === 'ready') && (
          <Button size="sm" variant="outline" onClick={() => requestStatus([order.id], primary)} disabled={isPending}>
            {primary === 'ready' ? 'Ready' : 'Collected'}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${order.orderNumber}`} disabled={isPending}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transitions.map((status) => (
              <DropdownMenuItem
                key={status}
                onSelect={() => requestStatus([order.id], status)}
                className={status === 'cancelled' ? 'text-destructive focus:text-destructive' : undefined}
              >
                {actionLabel(order.status, status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter orders by status">
          {(['all', ...MERCH_ORDER_STATUSES] as Filter[]).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`h-9 px-3 rounded-full text-[12px] font-medium border transition-colors ${
                filter === key
                  ? 'bg-[#d0bcff] text-[#3c0091] border-[#d0bcff]'
                  : 'bg-[#201f22] text-[#cbc3d7] border-[#353437] hover:border-[#494454]'
              }`}
            >
              {key === 'all' ? 'All' : MERCH_ORDER_STATUS_META[key].label}
              <span className="ml-1.5 opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#958ea0]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order #, runner or BIB"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#d0bcff]/30 bg-[#d0bcff]/5 px-3 py-2">
          <span className="text-[13px] text-[#e5e1e4] mr-auto">{selected.size} selected</span>
          <Button
            size="sm"
            onClick={() => requestStatus(selectedReadyable, 'ready')}
            disabled={isPending || selectedReadyable.length === 0}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Mark ready ({selectedReadyable.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => requestStatus(selectedCollectable, 'collected')}
            disabled={isPending || selectedCollectable.length === 0}
          >
            <CheckCheck className="h-4 w-4" />
            Mark collected ({selectedCollectable.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={isPending}>
            Clear
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-[#23232b] py-12 text-center text-[13px] text-[#958ea0]">
          {orders.length === 0 ? 'No orders yet for this event.' : 'No orders match this filter.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-[#23232b] overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all visible orders"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="h-4 w-4 accent-[#d0bcff]"
                    />
                  </TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Runner</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((order) => (
                  <TableRow key={order.id} data-state={selected.has(order.id) ? 'selected' : undefined}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${order.orderNumber}`}
                        checked={selected.has(order.id)}
                        onChange={() => toggle(order.id)}
                        className="h-4 w-4 accent-[#d0bcff]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-[13px]">{order.orderNumber}</div>
                      <div className="text-[11px] text-muted-foreground">{formatDate(order.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.runnerName}</div>
                      {order.bibNumber && <div className="text-[11px] text-muted-foreground">BIB {order.bibNumber}</div>}
                    </TableCell>
                    <TableCell className="text-[12px]">
                      {order.items.map((item, i) => (
                        <div key={i}>
                          {item.quantity}× {item.label}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRM(order.total)}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      {renderRowActions(order)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[12px] text-[#cbc3d7] px-1">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                className="h-4 w-4 accent-[#d0bcff]"
              />
              Select all shown
            </label>
            {visible.map((order) => (
              <div
                key={order.id}
                className={`rounded-xl border p-4 bg-[#1c1b1d] ${selected.has(order.id) ? 'border-[#d0bcff]/50' : 'border-[#353437]/60'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${order.orderNumber}`}
                    checked={selected.has(order.id)}
                    onChange={() => toggle(order.id)}
                    className="h-5 w-5 mt-0.5 accent-[#d0bcff]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[13px] text-[#e5e1e4]">{order.orderNumber}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="text-[13px] font-semibold text-[#e5e1e4] mt-1 truncate">
                      {order.runnerName}
                      {order.bibNumber && <span className="font-normal text-[#958ea0]"> · BIB {order.bibNumber}</span>}
                    </div>
                    <div className="text-[12px] text-[#cbc3d7] mt-1">
                      {order.items.map((item) => `${item.quantity}× ${item.label}`).join(', ')}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[13px] font-semibold text-[#e5e1e4]">{formatRM(order.total)}</span>
                      {renderRowActions(order)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.length === 1 ? 'this order' : `${cancelTarget?.length} orders`}?</AlertDialogTitle>
            <AlertDialogDescription>
              Paid items go back into stock. Refunds are not issued automatically. Handle them through
              your payment provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (cancelTarget) applyStatus(cancelTarget, 'cancelled')
              }}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
