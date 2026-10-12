'use client'

import { BarChart3, Users, Wallet } from "lucide-react"
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'

export interface EventStat {
  name: string
  total: number
  paid: number
  checkedIn: number
  revenue: number
}

export interface Demographics {
  gender: { label: string; value: number }[]
  ageGroups: { label: string; value: number }[]
  shirtSizes: { label: string; value: number }[]
}

export interface AnalyticsData {
  eventStats: EventStat[]
  demographics: Demographics
  totalRevenue: number
}

// Stitch color palette for charts
const CHART_COLORS = ['#0f9b9b', '#22c55e', '#0ea5e9', '#ef4444', '#f8fafc']

type TooltipEntry = { color?: string; name?: string; value?: number | string }
type RechartsTooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string }

// Custom Tooltip
function CustomTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-muted rounded-lg px-3 py-2 text-[12px] shadow-xl text-foreground">
      {label && <p className="font-semibold mb-1 text-muted-foreground">{label}</p>}
      {payload.map((entry, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-bold">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function OrganizerAnalyticsCharts({ data }: { data: AnalyticsData }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'demographics'>('overview')
  const { eventStats, demographics, totalRevenue } = data

  const hasEvents = eventStats.length > 0
  const hasRegistrations = eventStats.some((e) => e.total > 0)

  return (
    <div className="flex flex-col gap-6 w-full mt-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-muted pb-2">
        {(['overview', 'revenue', 'demographics'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-semibold tracking-wide uppercase transition-colors rounded-t-lg border-b-2 ${
              activeTab === tab 
                ? 'text-primary border-primary bg-primary/5' 
                : 'text-muted-foreground border-transparent hover:text-muted-foreground hover:bg-card'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          <div className="bg-card rounded-xl border border-muted p-6 shadow-lg">
            <h2 className="text-[16px] font-bold text-foreground mb-1">Event Performance</h2>
            <p className="text-[12px] text-muted-foreground mb-6">Registration trends across your events</p>
            {hasRegistrations ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventStats} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'var(--accent)', opacity: 0.4}} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} formatter={(value) => <span className="text-muted-foreground font-medium">{value}</span>} />
                    <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]} fill="#0f9b9b" />
                    <Bar dataKey="paid" name="Paid" radius={[4, 4, 0, 0]} fill="#22c55e" />
                    <Bar dataKey="checkedIn" name="Checked In" radius={[4, 4, 0, 0]} fill="#0ea5e9" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon="chart" message="No registrations yet" />}
          </div>

          <div className="bg-card rounded-xl border border-muted overflow-x-auto shadow-lg">
            <div className="p-6 border-b border-muted">
              <h2 className="text-[16px] font-bold text-foreground mb-1">Event Details</h2>
              <p className="text-[12px] text-muted-foreground">Registration and revenue per event</p>
            </div>
            {hasEvents ? (
              <div className="min-w-[600px]">
                <div className="grid grid-cols-5 text-[10px] leading-[14px] tracking-[0.05em] font-semibold text-muted-foreground uppercase px-6 py-3 border-b border-muted bg-card">
                  <div className="col-span-1">Event</div>
                  <div className="text-right">Total</div>
                  <div className="text-right">Paid</div>
                  <div className="text-right">Checked In</div>
                  <div className="text-right">Revenue (RM)</div>
                </div>
                <div className="divide-y divide-muted">
                  {eventStats.map((event) => (
                    <div key={event.name} className="grid grid-cols-5 px-6 py-4 items-center text-[13px] text-foreground hover:bg-card transition-colors">
                      <div className="font-semibold">{event.name}</div>
                      <div className="text-right">{event.total}</div>
                      <div className="text-right">{event.paid}</div>
                      <div className="text-right">{event.checkedIn}</div>
                      <div className="text-right text-success font-mono">{event.revenue.toFixed(2)}</div>
                    </div>
                  ))}
                  <div className="grid grid-cols-5 px-6 py-4 items-center text-[13px] text-foreground bg-card/50 font-bold">
                    <div>Total</div>
                    <div className="text-right">{eventStats.reduce((s, e) => s + e.total, 0)}</div>
                    <div className="text-right">{eventStats.reduce((s, e) => s + e.paid, 0)}</div>
                    <div className="text-right">{eventStats.reduce((s, e) => s + e.checkedIn, 0)}</div>
                    <div className="text-right text-success font-mono">{totalRevenue.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ) : <EmptyState icon="chart" message="No events yet" />}
          </div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="flex flex-col gap-6">
          <div className="bg-card rounded-xl border border-muted p-6 shadow-lg">
            <h2 className="text-[16px] font-bold text-foreground mb-1">Revenue Breakdown</h2>
            <p className="text-[12px] text-muted-foreground mb-6">Income from paid registrations</p>
            {totalRevenue > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventStats} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `RM${v}`} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'var(--accent)', opacity: 0.4}} />
                    <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon="money" message="No revenue yet" />}
          </div>

          <div className="bg-card rounded-xl border border-muted overflow-x-auto shadow-lg">
            <div className="p-6 border-b border-muted">
              <h2 className="text-[16px] font-bold text-foreground mb-1">Revenue Details</h2>
              <p className="text-[12px] text-muted-foreground">Revenue per event</p>
            </div>
            {hasEvents ? (
              <div className="min-w-[600px]">
                <div className="grid grid-cols-4 text-[10px] leading-[14px] tracking-[0.05em] font-semibold text-muted-foreground uppercase px-6 py-3 border-b border-muted bg-card">
                  <div>Event</div>
                  <div className="text-right">Paid Registrations</div>
                  <div className="text-right">Revenue (RM)</div>
                  <div className="text-right">Avg / Registration</div>
                </div>
                <div className="divide-y divide-muted">
                  {eventStats.map((event) => (
                    <div key={event.name} className="grid grid-cols-4 px-6 py-4 items-center text-[13px] text-foreground hover:bg-card transition-colors">
                      <div className="font-semibold">{event.name}</div>
                      <div className="text-right">{event.paid}</div>
                      <div className="text-right text-success font-mono">{event.revenue.toFixed(2)}</div>
                      <div className="text-right text-muted-foreground font-mono">
                        {event.paid > 0 ? (event.revenue / event.paid).toFixed(2) : '0.00'}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-4 px-6 py-4 items-center text-[13px] text-foreground bg-card/50 font-bold">
                    <div>Total</div>
                    <div className="text-right">{eventStats.reduce((s, e) => s + e.paid, 0)}</div>
                    <div className="text-right text-success font-mono">{totalRevenue.toFixed(2)}</div>
                    <div className="text-right text-muted-foreground font-mono">
                      {(() => {
                        const totalPaid = eventStats.reduce((s, e) => s + e.paid, 0)
                        return totalPaid > 0 ? (totalRevenue / totalPaid).toFixed(2) : '0.00'
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ) : <EmptyState icon="chart" message="No events yet" />}
          </div>
        </div>
      )}

      {activeTab === 'demographics' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-card rounded-xl border border-muted p-6 shadow-lg">
            <h2 className="text-[16px] font-bold text-foreground mb-1">Gender Distribution</h2>
            <p className="text-[12px] text-muted-foreground mb-6">Runner gender breakdown</p>
            {demographics.gender.some((g) => g.value > 0) ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={demographics.gender} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80} innerRadius={55} paddingAngle={4} stroke="none">
                      {demographics.gender.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} formatter={(value) => <span className="text-muted-foreground">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon="users" message="No gender data available" />}
          </div>

          <div className="bg-card rounded-xl border border-muted p-6 shadow-lg">
            <h2 className="text-[16px] font-bold text-foreground mb-1">Age Groups</h2>
            <p className="text-[12px] text-muted-foreground mb-6">Runner age distribution</p>
            {demographics.ageGroups.some((a) => a.value > 0) ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demographics.ageGroups} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'var(--accent)', opacity: 0.4}} />
                    <Bar dataKey="value" name="Runners" radius={[4, 4, 0, 0]} fill="#0ea5e9" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon="users" message="No age data available" />}
          </div>

          <div className="bg-card rounded-xl border border-muted p-6 shadow-lg lg:col-span-2">
            <h2 className="text-[16px] font-bold text-foreground mb-1">T-Shirt Sizes</h2>
            <p className="text-[12px] text-muted-foreground mb-6">Size distribution for event merchandise</p>
            {demographics.shirtSizes.some((s) => s.value > 0) ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demographics.shirtSizes} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: 'var(--accent)', opacity: 0.4}} />
                    <Bar dataKey="value" name="Runners" radius={[4, 4, 0, 0]} fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon="users" message="No t-shirt size data available" />}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, message }: { icon: 'chart' | 'money' | 'users'; message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-border">
      <div className="text-center">
        {icon === 'chart' && <BarChart3 className="size-[48px] mb-2 opacity-50" />}
        {icon === 'money' && <Wallet className="size-[48px] mb-2 opacity-50" />}
        {icon === 'users' && <Users className="size-[48px] mb-2 opacity-50" />}
        <p className="text-[12px] font-medium">{message}</p>
      </div>
    </div>
  )
}
