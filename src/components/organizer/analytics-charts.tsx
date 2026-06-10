'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── Chart colors (use CSS vars for dark/light) ──────────────────────────────

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
]

// ── Custom Tooltip for recharts ───────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="border-border bg-background rounded-lg border px-3 py-2 text-xs shadow-xl">
      {label && <p className="font-medium mb-1">{label}</p>}
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export default function OrganizerAnalyticsCharts({ data }: { data: AnalyticsData }) {
  const { eventStats, demographics, totalRevenue } = data

  const hasEvents = eventStats.length > 0
  const hasRegistrations = eventStats.some((e) => e.total > 0)

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="revenue">Revenue</TabsTrigger>
        <TabsTrigger value="demographics">Demographics</TabsTrigger>
      </TabsList>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
      <TabsContent value="overview" className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Event Performance</CardTitle>
            <CardDescription>Registration trends across your events</CardDescription>
          </CardHeader>
          <CardContent>
            {hasRegistrations ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventStats} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px' }}
                      formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                    />
                    <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]} fill="var(--color-chart-1)" />
                    <Bar dataKey="paid" name="Paid" radius={[4, 4, 0, 0]} fill="var(--color-chart-2)" />
                    <Bar dataKey="checkedIn" name="Checked In" radius={[4, 4, 0, 0]} fill="var(--color-chart-3)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon="chart" message="No registrations yet" />
            )}
          </CardContent>
        </Card>

        {/* Event details table */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
            <CardDescription>Registration and revenue per event</CardDescription>
          </CardHeader>
          <CardContent>
            {hasEvents ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Checked In</TableHead>
                    <TableHead className="text-right">Revenue (RM)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventStats.map((event) => (
                    <TableRow key={event.name}>
                      <TableCell className="font-medium">{event.name}</TableCell>
                      <TableCell className="text-right">{event.total}</TableCell>
                      <TableCell className="text-right">{event.paid}</TableCell>
                      <TableCell className="text-right">{event.checkedIn}</TableCell>
                      <TableCell className="text-right">{event.revenue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {eventStats.reduce((s, e) => s + e.total, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {eventStats.reduce((s, e) => s + e.paid, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {eventStats.reduce((s, e) => s + e.checkedIn, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {totalRevenue.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <EmptyState icon="chart" message="No events yet" />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── REVENUE TAB ──────────────────────────────────────────────────── */}
      <TabsContent value="revenue" className="space-y-4">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
            <CardDescription>Income from paid registrations</CardDescription>
          </CardHeader>
          <CardContent>
            {totalRevenue > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventStats} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `RM ${v}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} fill="var(--color-chart-2)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon="money" message="No revenue yet" />
            )}
          </CardContent>
        </Card>

        {/* Revenue table */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Revenue Details</CardTitle>
            <CardDescription>Revenue per event</CardDescription>
          </CardHeader>
          <CardContent>
            {hasEvents ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Paid Registrations</TableHead>
                    <TableHead className="text-right">Revenue (RM)</TableHead>
                    <TableHead className="text-right">Avg / Registration (RM)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventStats.map((event) => (
                    <TableRow key={event.name}>
                      <TableCell className="font-medium">{event.name}</TableCell>
                      <TableCell className="text-right">{event.paid}</TableCell>
                      <TableCell className="text-right">{event.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {event.paid > 0 ? (event.revenue / event.paid).toFixed(2) : '0.00'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">
                      {eventStats.reduce((s, e) => s + e.paid, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {totalRevenue.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const totalPaid = eventStats.reduce((s, e) => s + e.paid, 0)
                        return totalPaid > 0 ? (totalRevenue / totalPaid).toFixed(2) : '0.00'
                      })()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            ) : (
              <EmptyState icon="chart" message="No events yet" />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── DEMOGRAPHICS TAB ─────────────────────────────────────────────── */}
      <TabsContent value="demographics" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Gender distribution */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Gender Distribution</CardTitle>
              <CardDescription>Runner gender breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {demographics.gender.some((g) => g.value > 0) ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={demographics.gender}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={50}
                        paddingAngle={4}
                      >
                        {demographics.gender.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: '12px' }}
                        formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon="users" message="No gender data available" />
              )}
            </CardContent>
          </Card>

          {/* Age groups */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Age Groups</CardTitle>
              <CardDescription>Runner age distribution</CardDescription>
            </CardHeader>
            <CardContent>
              {demographics.ageGroups.some((a) => a.value > 0) ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={demographics.ageGroups} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Runners" radius={[4, 4, 0, 0]} fill="var(--color-chart-3)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon="users" message="No age data available" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* T-shirt sizes */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle>T-Shirt Sizes</CardTitle>
            <CardDescription>Size distribution for event merchandise</CardDescription>
          </CardHeader>
          <CardContent>
            {demographics.shirtSizes.some((s) => s.value > 0) ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demographics.shirtSizes} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Runners" radius={[4, 4, 0, 0]} fill="var(--color-chart-4)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon="users" message="No t-shirt size data available" />
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

// ── Empty state helper ────────────────────────────────────────────────────────

function EmptyState({ icon, message }: { icon: 'chart' | 'money' | 'users'; message: string }) {
  return (
    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        {icon === 'chart' && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-12 w-12 mx-auto mb-4 opacity-40"
          >
            <path d="M3 3v18h18" />
            <path d="M18 9l-5 5-4-4-3 3" />
          </svg>
        )}
        {icon === 'money' && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-12 w-12 mx-auto mb-4 opacity-40"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v12M8 10h8M8 14h8" />
          </svg>
        )}
        {icon === 'users' && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-12 w-12 mx-auto mb-4 opacity-40"
          >
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
        )}
        <p className="text-sm">{message}</p>
      </div>
    </div>
  )
}
