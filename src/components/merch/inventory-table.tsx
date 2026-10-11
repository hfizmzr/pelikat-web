'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { updateMerchVariantStock } from '@/components/merch/actions'
import { stockLevel, variantLabel, type MerchProduct, type StockLevel } from '@/lib/merch'

const LEVEL_BADGE: Record<StockLevel, { label: string; className: string }> = {
  out: { label: 'Sold out', className: 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/30' },
  low: { label: 'Low stock', className: 'text-[#f5c26b] bg-[#f5c26b]/10 border-[#f5c26b]/30' },
  ok: { label: 'In stock', className: 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20' },
}

type InventoryRow = {
  id: string
  productName: string
  variant: string
  stock: number
  threshold: number
}

export function InventoryTable({ products }: { products: MerchProduct[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const rows = useMemo<InventoryRow[]>(
    () =>
      products.flatMap((p) =>
        p.merch_variants.map((v) => ({
          id: v.id,
          productName: p.name,
          variant: variantLabel(v),
          stock: v.stock,
          threshold: p.low_stock_threshold,
        }))
      ),
    [products]
  )

  const alertCount = rows.filter((r) => stockLevel(r.stock, r.threshold) !== 'ok').length
  const visibleRows = alertsOnly ? rows.filter((r) => stockLevel(r.stock, r.threshold) !== 'ok') : rows

  const changes = rows
    .filter((r) => drafts[r.id] !== undefined && drafts[r.id] !== '' && Number(drafts[r.id]) !== r.stock)
    .map((r) => ({ id: r.id, stock: Number.parseInt(drafts[r.id], 10) }))

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateMerchVariantStock(changes)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Stock updated for ${changes.length} variant${changes.length !== 1 ? 's' : ''}`)
      setDrafts({})
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return <p className="text-[13px] text-[#958ea0] py-8 text-center">Add a product to start tracking stock.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {alertCount > 0 ? (
          <div className="flex items-center gap-2 text-[13px] text-[#f5c26b]">
            <AlertTriangle className="h-4 w-4" />
            {alertCount} variant{alertCount !== 1 ? 's' : ''} low or sold out
          </div>
        ) : (
          <span className="text-[13px] text-[#958ea0]">All variants above their low-stock threshold.</span>
        )}
        <div className="flex items-center gap-2">
          <Switch id="alerts-only" checked={alertsOnly} onCheckedChange={setAlertsOnly} />
          <Label htmlFor="alerts-only" className="text-[13px]">Low stock only</Label>
        </div>
      </div>

      <div className="rounded-xl border border-[#23232b] overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Variant</TableHead>
              <TableHead className="text-center">Alert at</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-36 text-right">Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => {
              const draft = drafts[row.id]
              const effectiveStock = draft !== undefined && draft !== '' ? Number(draft) : row.stock
              const level = LEVEL_BADGE[stockLevel(effectiveStock, row.threshold)]
              const changed = draft !== undefined && draft !== '' && Number(draft) !== row.stock

              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell>{row.variant}</TableCell>
                  <TableCell className="text-center text-muted-foreground">≤ {row.threshold}</TableCell>
                  <TableCell>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${level.className}`}>
                      {level.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`${row.productName} ${row.variant} stock`}
                      type="number"
                      min={0}
                      step={1}
                      value={draft ?? String(row.stock)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                      className={`ml-auto w-24 text-right ${changed ? 'border-[#4cd7f6]' : ''}`}
                      disabled={isPending}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end gap-2">
        {changes.length > 0 && (
          <Button variant="outline" onClick={() => setDrafts({})} disabled={isPending}>
            Discard
          </Button>
        )}
        <Button onClick={handleSave} disabled={isPending || changes.length === 0}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save {changes.length > 0 ? `${changes.length} change${changes.length !== 1 ? 's' : ''}` : 'stock'}
        </Button>
      </div>
    </div>
  )
}
