'use client'

import { BarChart3 } from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export interface CategoryStat {
  name: string
  male: number
  female: number
  checkedIn: number
}

const MALE_COLOR = '#0ea5e9'
const FEMALE_COLOR = '#0f9b9b'
const CHECKED_IN_COLOR = '#22c55e'

interface TooltipEntry {
  color?: string
  name?: string
  value?: number | string
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-muted rounded-lg px-3 py-2 text-[12px] shadow-xl text-foreground">
      {label && <p className="font-semibold mb-1 text-muted-foreground">{label}</p>}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-bold">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function CategoryBreakdownChart({ data }: { data: CategoryStat[] }) {
  if (data.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center text-center">
        <BarChart3 className="size-[32px] text-muted-foreground/50 mb-2" />
        <p className="text-[13px] text-muted-foreground">No categories defined yet</p>
      </div>
    )
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent)', opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} formatter={(value) => <span className="text-muted-foreground font-medium">{value}</span>} />
          <Bar dataKey="male" name="Male" stackId="gender" fill={MALE_COLOR} radius={[0, 0, 0, 0]} />
          <Bar dataKey="female" name="Female" stackId="gender" fill={FEMALE_COLOR} />
          <Bar dataKey="checkedIn" name="Checked In" stackId="checkin" fill={CHECKED_IN_COLOR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
