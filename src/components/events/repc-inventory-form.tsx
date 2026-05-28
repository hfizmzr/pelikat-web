'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { updateEventShirtInventory } from '@/components/events/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type InventoryRow = {
  size: string
  demand: number
  initialQty: number
  claimedQty: number
}

type RepcInventoryFormProps = {
  eventId: string
  rows: InventoryRow[]
}

function clampQuantity(value: string, minimum: number) {
  if (value.trim() === '') return minimum

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return minimum

  return Math.max(minimum, parsed)
}

export function RepcInventoryForm({ eventId, rows }: RepcInventoryFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((row) => [row.size, row.initialQty]))
  )

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const initialQty = quantities[row.size] ?? row.initialQty
        acc.demand += row.demand
        acc.initial += initialQty
        acc.claimed += row.claimedQty
        acc.remaining += Math.max(initialQty - row.claimedQty, 0)
        return acc
      },
      { demand: 0, initial: 0, claimed: 0, remaining: 0 }
    )
  }, [quantities, rows])

  const claimedPercent =
    totals.initial > 0 ? Math.min(Math.round((totals.claimed / totals.initial) * 100), 100) : 0

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      try {
        await updateEventShirtInventory(eventId, formData)
        toast.success('REPC shirt inventory saved')
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save shirt inventory')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-sm text-muted-foreground">Prepared</p>
          <p className="text-2xl font-semibold">{totals.initial}</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-sm text-muted-foreground">Claimed</p>
          <p className="text-2xl font-semibold">{totals.claimed}</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-sm text-muted-foreground">Remaining</p>
          <p className="text-2xl font-semibold">{totals.remaining}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Collection progress</span>
          <span className="font-medium">{claimedPercent}%</span>
        </div>
        <Progress value={claimedPercent} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Size</TableHead>
            <TableHead className="text-center">Requested</TableHead>
            <TableHead className="text-center">Claimed</TableHead>
            <TableHead className="text-center">Remaining</TableHead>
            <TableHead className="w-40 text-right">Prepared Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const initialQty = quantities[row.size] ?? row.initialQty
            const remainingQty = Math.max(initialQty - row.claimedQty, 0)

            return (
              <TableRow key={row.size}>
                <TableCell className="font-medium">{row.size}</TableCell>
                <TableCell className="text-center">{row.demand}</TableCell>
                <TableCell className="text-center">{row.claimedQty}</TableCell>
                <TableCell className="text-center">{remainingQty}</TableCell>
                <TableCell>
                  <Label htmlFor={`initial_qty_${row.size}`} className="sr-only">
                    {row.size} prepared quantity
                  </Label>
                  <Input
                    id={`initial_qty_${row.size}`}
                    name={`initial_qty_${row.size}`}
                    type="number"
                    min={row.claimedQty}
                    value={initialQty}
                    onChange={(event) =>
                      setQuantities((current) => ({
                        ...current,
                        [row.size]: clampQuantity(event.target.value, row.claimedQty),
                      }))
                    }
                    className="ml-auto w-28 text-right"
                    disabled={isPending}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Save className="mr-2 h-4 w-4" />
          {isPending ? 'Saving...' : 'Save Inventory'}
        </Button>
      </div>
    </form>
  )
}
