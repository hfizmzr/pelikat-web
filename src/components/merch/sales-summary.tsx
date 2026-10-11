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
    <div className="bg-[#1c1b1d] border border-[#353437] rounded-lg px-3 py-2 text-[12px] shadow-xl text-[#e5e1e4]">
      <p className="font-semibold mb-1">{row.name}</p>
      <p className="text-[#cbc3d7]">
        Revenue <span className="font-semibold text-[#e5e1e4]">{formatRM(row.revenue)}</span>
      </p>
      <p className="text-[#cbc3d7]">
        Items sold <span className="font-semibold text-[#e5e1e4]">{row.items_sold}</span>
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
    { label: 'Items sold', value: totalItems.toLocaleString() },
    { label: 'Paid orders', value: paidOrders.toLocaleString() },
    { label: 'Awaiting payment', value: pendingOrders.toLocaleString() },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-[#1c1b1d] rounded-xl p-4 border border-[#23232b]">
            <div className="text-[11px] text-[#958ea0]">{tile.label}</div>
            <div className="text-[22px] leading-[28px] tracking-[-0.01em] font-semibold text-[#e5e1e4] mt-1 tabular-nums">
              {tile.value}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-[#958ea0]">
        Counts confirmed, ready and collected orders. Pending and cancelled orders are excluded.
      </p>

      {sales.length === 0 ? (
        <p className="text-[13px] text-[#958ea0] py-8 text-center">No products yet.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] p-4">
            <h3 className="text-[14px] font-semibold text-[#e5e1e4]">Revenue by product</h3>
            <div className="mt-3" style={{ height: Math.max(160, sorted.length * 44 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#2a2a2c" />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => `RM ${v}`}
                    tick={{ fill: '#958ea0', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: '#cbc3d7', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<RevenueTooltip />} cursor={{ fill: '#ffffff08' }} />
                  <Bar dataKey="revenue" fill="#4cd7f6" barSize={20} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-[#23232b] overflow-x-auto">
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
