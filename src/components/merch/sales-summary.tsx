'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRM, type MerchProductSales } from '@/lib/merch'

type SalesSummaryProps = {
  sales: MerchProductSales[]
  paidOrders: number
  pendingOrders: number
}

function RevenueTooltip({ active, payload }: { active?: boolean; payload?: { payload: MerchProductSales }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-[12px] shadow-xl text-foreground">
      <p className="font-semibold mb-1">{row.name}</p>
      <p className="text-muted-foreground">
        Revenue <span className="font-semibold text-foreground">{formatRM(row.revenue)}</span>
      </p>
      <p className="text-muted-foreground">
        Items sold <span className="font-semibold text-foreground">{row.items_sold}</span>
      </p>
    </div>
  )
}

export function SalesSummary({ sales, paidOrders, pendingOrders }: SalesSummaryProps) {
  const totalRevenue = sales.reduce((sum, s) => sum + s.revenue, 0)
  const totalItems = sales.reduce((sum, s) => sum + s.items_sold, 0)
  const sorted = [...sales].sort((a, b) => b.revenue - a.revenue)

  const tiles = [
    { label: 'Total revenue', value: formatRM(totalRevenue) },
    { label: 'Items sold', value: totalItems.toLocaleString('en-MY') },
    { label: 'Paid orders', value: paidOrders.toLocaleString('en-MY') },
    { label: 'Awaiting payment', value: pendingOrders.toLocaleString('en-MY') },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-card rounded-xl p-4 border border-muted">
            <div className="text-[11px] text-muted-foreground">{tile.label}</div>
            <div className="text-[22px] leading-[28px] tracking-[-0.01em] font-semibold text-foreground mt-1 tabular-nums">
              {tile.value}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        Counts confirmed, ready and collected orders. Pending and cancelled orders are excluded.
      </p>

      {sales.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-8 text-center">No products yet.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="bg-card rounded-xl border border-muted p-4">
            <h3 className="text-[14px] font-semibold text-foreground">Revenue by product</h3>
            <div className="mt-3" style={{ height: Math.max(160, sorted.length * 44 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => `RM ${v}`}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'var(--accent)', opacity: 0.4 }} />
                  <Bar dataKey="revenue" fill="var(--primary)" barSize={20} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-muted overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Items sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.product_id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.items_sold}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRM(row.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totalItems}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRM(totalRevenue)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
