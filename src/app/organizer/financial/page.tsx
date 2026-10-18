import { Banknote, CircleCheck, Clock, Download, Flag, Info } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

type FinancialRegistration = {
  id: string
  payment_status: string
  created_at: string
  race_categories: { price: number | null } | null
  events: { id: string; name: string } | null
}

export const metadata: Metadata = {
  title: 'Financial Rails - Organizer Hub | Pelikat',
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
    const ename = r.events?.name || 'Unknown Event'
    if (!eventRevMap[eid]) eventRevMap[eid] = { name: ename, revenue: 0, count: 0 }
    eventRevMap[eid].revenue += Number(r.race_categories?.price || 0)
    eventRevMap[eid].count++
  })
  const eventRevList = Object.values(eventRevMap).sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      <div className="absolute -top-20 left-1/2 w-[40rem] h-[20rem] bg-success/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-success/10 text-success uppercase w-fit">
              Financial Rails
            </span>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">Financial Rails</h1>
            <p className="text-[14px] leading-[20px] text-muted-foreground">Revenue overview and connected payment gateway operations.</p>
          </div>
          <button className="px-4 py-2.5 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] font-medium rounded-lg flex items-center gap-2 border border-muted transition-colors">
            <Download className="size-[18px]" />
            Export Report
          </button>
        </div>

        {/* Revenue KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl p-6 border border-muted">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium">Gross Revenue</span>
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-success">
                <Banknote className="size-[20px]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[18px] font-semibold text-muted-foreground">RM</span>
              <span className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{grossRevenue.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-success text-[11px] mt-2">
              <CircleCheck className="size-[14px]" />
              <span>{paidRegs.length} confirmed transactions</span>
            </div>
          </div>

          <div className="bg-card rounded-xl p-6 border border-muted">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-muted-foreground uppercase font-medium">Pending Revenue</span>
              <div className="w-9 h-9 rounded-lg bg-card flex items-center justify-center text-primary">
                <Clock className="size-[20px]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[18px] font-semibold text-muted-foreground">RM</span>
              <span className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-foreground">{pendingRevenue.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-primary text-[11px] mt-2">
              <Info className="size-[14px]" />
              <span>Awaiting payment confirmation</span>
            </div>
          </div>

          {/* Payment Rails status */}
          <div className="bg-card rounded-xl p-6 border border-muted flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-foreground">Payment Rails</span>
              <span className="px-2 py-0.5 rounded-full bg-success/15 text-success text-[10px] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Operational
              </span>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {[
                { label: 'FPX B2C/B2B', sublabel: 'Online Banking', badge: 'FPX' },
                { label: 'Visa / Master / Apple Pay', sublabel: 'Stripe Direct', badge: 'Cards' },
                { label: 'DuitNow QR', sublabel: 'PayNet Gateway', badge: 'QR' },
              ].map(rail => (
                <div key={rail.label} className="p-2.5 rounded-lg bg-card flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-7 rounded bg-accent flex items-center justify-center text-[10px] font-bold text-foreground">{rail.badge}</div>
                    <div>
                      <div className="text-[12px] leading-[16px] font-semibold text-foreground">{rail.label}</div>
                      <div className="text-[10px] text-muted-foreground">{rail.sublabel}</div>
                    </div>
                  </div>
                  <span className="text-success text-[11px] font-medium">Active</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-muted flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Payout: Daily T+1 Auto</span>
              <span className="text-primary cursor-pointer hover:underline">Settings →</span>
            </div>
          </div>
        </div>

        {/* Monthly revenue bar chart */}
        <div className="bg-card rounded-xl p-6 border border-muted">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-foreground">Monthly Revenue</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Last 6 months revenue trend</p>
            </div>
          </div>
          <div className="w-full h-44 flex items-end justify-between gap-3 px-2">
            {monthlyData.map(({ label, revenue }) => {
              const pct = Math.round((revenue / maxMonthly) * 100)
              const isBest = revenue === maxMonthly && revenue > 0
              return (
                <div key={label} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className={`text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity ${isBest ? 'text-success' : 'text-primary'}`}>
                    RM{(revenue / 1000).toFixed(0)}k
                  </span>
                  <div
                    className={`w-full rounded-t transition-all ${isBest ? 'bg-success group-hover:bg-success' : 'bg-primary/30 group-hover:bg-primary'}`}
                    style={{ height: `${Math.max(pct, 3)}%` }}
                  />
                  <span className={`text-[10px] ${isBest ? 'text-success font-semibold' : 'text-muted-foreground'}`}>{label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Per-event revenue table */}
        {eventRevList.length > 0 && (
          <div className="bg-card rounded-xl border border-muted overflow-hidden">
            <div className="px-6 py-4 border-b border-muted bg-card">
              <h2 className="text-[16px] leading-[24px] font-semibold text-foreground">Revenue by Event</h2>
            </div>
            <div className="divide-y divide-muted">
              {eventRevList.map(({ name, revenue, count }) => (
                <div key={name} className="flex items-center justify-between px-6 py-4 hover:bg-card transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center text-primary">
                      <Flag className="size-[18px]" />
                    </div>
                    <div>
                      <div className="text-[14px] leading-[20px] font-medium text-foreground">{name}</div>
                      <div className="text-[12px] text-muted-foreground">{count} paid registrations</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] leading-[24px] font-semibold text-success">RM {revenue.toLocaleString('en-MY')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
