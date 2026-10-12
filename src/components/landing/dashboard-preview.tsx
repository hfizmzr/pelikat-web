"use client"

import { Area, AreaChart, ResponsiveContainer, XAxis } from "recharts"

const SAMPLE_DATA = [
  { day: "Mon", registrations: 42 },
  { day: "Tue", registrations: 68 },
  { day: "Wed", registrations: 55 },
  { day: "Thu", registrations: 94 },
  { day: "Fri", registrations: 120 },
  { day: "Sat", registrations: 240 },
  { day: "Sun", registrations: 180 },
]

export function DashboardPreview() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Registration velocity
        </span>
        <span className="text-[10px] font-medium text-muted-foreground">
          Sample event data
        </span>
      </div>

      {/* Chart */}
      <div className="h-40 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={SAMPLE_DATA} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="velocityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <Area
              type="monotone"
              dataKey="registrations"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#velocityFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
