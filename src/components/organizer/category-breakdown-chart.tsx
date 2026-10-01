'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export interface CategoryStat {
  name: string
  male: number
  female: number
  checkedIn: number
}

const MALE_COLOR = '#4cd7f6'
const FEMALE_COLOR = '#d0bcff'
const CHECKED_IN_COLOR = '#4edea3'

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
    <div className="bg-[#1c1b1d] border border-[#23232b] rounded-lg px-3 py-2 text-[12px] shadow-xl text-[#e5e1e4]">
      {label && <p className="font-semibold mb-1 text-[#cbc3d7]">{label}</p>}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-[#958ea0]">{entry.name}:</span>
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
        <span className="material-symbols-outlined text-[32px] text-[#353437] mb-2">bar_chart</span>
        <p className="text-[13px] text-[#958ea0]">No categories defined yet</p>
      </div>
    )
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#23232b" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#958ea0', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#958ea0', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#2a2a2c', opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} formatter={(value) => <span className="text-[#cbc3d7] font-medium">{value}</span>} />
          <Bar dataKey="male" name="Male" stackId="gender" fill={MALE_COLOR} radius={[0, 0, 0, 0]} />
          <Bar dataKey="female" name="Female" stackId="gender" fill={FEMALE_COLOR} />
          <Bar dataKey="checkedIn" name="Checked In" stackId="gender" fill={CHECKED_IN_COLOR} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
