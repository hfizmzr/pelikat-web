import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from '@/components/organizer/export-csv-button'
import type { Metadata } from 'next'

type FinancialRegistration = {
  id: string
  payment_status: string
  created_at: string
  race_categories: { price: number | null } | null
  events: { id: string; name: string } | null
}

export const metadata: Metadata = {
  title: 'Finance - Pelikat',
  description: 'Revenue overview, payment gateway status, and financial reporting for your events',
}

export default async function OrganizerFinancialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  const { data: registrations } = await supabase
    .from('registrations')
    .select(`
      id, payment_status, created_at,
      race_categories(price),
      events(id, name)
    `)
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: true })

  const regs = (registrations ?? []) as unknown as FinancialRegistration[]

  // Revenue aggregation
  const paidRegs = regs.filter(r => r.payment_status === 'paid')
  const grossRevenue = paidRegs.reduce((a, r) => a + Number(r.race_categories?.price || 0), 0)
  const pendingRevenue = regs
    .filter(r => r.payment_status === 'pending')
    .reduce((a, r) => a + Number(r.race_categories?.price || 0), 0)

  // Monthly breakdown (last 6 months)
  const now = new Date()
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const label = d.toLocaleDateString('en-MY', { month: 'short', year: '2-digit' })
    const revenue = paidRegs
      .filter(r => {
        const rd = new Date(r.created_at)
        return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear()
      })
      .reduce((a, r) => a + Number(r.race_categories?.price || 0), 0)
    return { label, revenue }
  })
  const maxMonthly = Math.max(...monthlyData.map(m => m.revenue), 1)

  // Per-event revenue
  const eventRevMap: Record<string, { name: string; revenue: number; count: number }> = {}
  paidRegs.forEach(r => {
    const eid = r.events?.id || 'unknown'
    const ename = r.events?.name || 'Unknown event'
    if (!eventRevMap[eid]) eventRevMap[eid] = { name: ename, revenue: 0, count: 0 }
    eventRevMap[eid].revenue += Number(r.race_categories?.price || 0)
    eventRevMap[eid].count++
  })
  const eventRevList = Object.values(eventRevMap).sort((a, b) => b.revenue - a.revenue)

  const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-[28px] leading-9 font-medium text-foreground">Finance</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">Entry fee revenue across your events</p>
          </div>
          {/* Audit #8: Export Report was dead — real CSV download via the
          shared ExportCsvButton (per-event revenue + monthly trend). */}
          <ExportCsvButton
            filename={`financial-report-${new Date().toISOString().slice(0, 10)}.csv`}
            headers={['Period', 'Type', 'Name', 'Paid registrations', 'Revenue (RM)']}
            rows={[
              ...monthlyData.map(m => ['monthly', 'Monthly revenue', m.label, null, Number(m.revenue.toFixed(2))] as const),
              ...eventRevList.map(e => ['per-event', 'Revenue by event', e.name, e.count, Number(e.revenue.toFixed(2))] as const),
            ]}
          >
            Export report
          </ExportCsvButton>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[13px] text-muted-foreground">Received</p>
            <p className="mt-2 text-[32px] leading-none font-medium tabular-nums text-foreground">{rm(grossRevenue)}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">{paidRegs.length} paid registrations</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[13px] text-muted-foreground">Awaiting payment</p>
            <p className="mt-2 text-[32px] leading-none font-medium tabular-nums text-foreground">{rm(pendingRevenue)}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">Registrations not yet confirmed</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-[13px] text-muted-foreground">Payment methods</p>
            <p className="mt-2 text-[15px] text-foreground">DuitNow QR · FPX · Card</p>
            <p className="mt-2 text-[13px] text-muted-foreground">Processed through HitPay and confirmed automatically</p>
          </div>
        </div>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-[16px] font-medium text-foreground">Monthly revenue</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Last 6 months</p>
          <div className="mt-6 flex h-48 items-end justify-between gap-3 border-b border-border">
            {monthlyData.map(({ label, revenue }) => {
              const pct = Math.round((revenue / maxMonthly) * 100)
              const isBest = revenue === maxMonthly && revenue > 0
              // Percentage heights resolve to 0 inside the auto-height flex
              // columns below (audit #13: bars never mounted), so size the
              // bars in px against the fixed plot area.
              const barHeight = Math.max(Math.round((pct / 100) * 150), 3)
              return (
                <div key={label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                  <span className={`font-mono text-[11px] tabular-nums ${isBest ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {revenue > 0 ? revenue.toLocaleString('en-MY', { maximumFractionDigits: 0 }) : ''}
                  </span>
                  <div
                    className={`w-full max-w-20 rounded-t-[3px] ${isBest ? 'bg-primary' : 'bg-muted-foreground/25'}`}
                    style={{ height: `${barHeight}px` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between gap-3">
            {monthlyData.map(({ label }) => (
              <span key={label} className="flex-1 text-center font-mono text-[11px] text-muted-foreground">{label}</span>
            ))}
          </div>
        </section>

        {eventRevList.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between border-b border-border px-5 py-3">
              <h2 className="text-[16px] font-medium text-foreground">Revenue by event</h2>
              <span className="text-[12px] text-muted-foreground">Paid registrations</span>
            </div>
            <ul className="divide-y divide-border">
              {eventRevList.map(({ name, revenue, count }) => (
                <li key={name} className="grid grid-cols-[1fr_auto_120px] items-center gap-6 px-5 py-3">
                  <span className="truncate text-[14px] text-foreground">{name}</span>
                  <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
                  <span className="text-right font-mono text-[14px] tabular-nums text-foreground">{rm(revenue)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
