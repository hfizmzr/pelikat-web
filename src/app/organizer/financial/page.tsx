import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

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

  // Revenue aggregation
  const paidRegs = registrations?.filter(r => r.payment_status === 'paid') || []
  const grossRevenue = paidRegs.reduce((a, r) => a + Number((r.race_categories as any)?.price || 0), 0)
  const pendingRevenue = (registrations?.filter(r => r.payment_status === 'pending') || [])
    .reduce((a, r) => a + Number((r.race_categories as any)?.price || 0), 0)

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
      .reduce((a, r) => a + Number((r.race_categories as any)?.price || 0), 0)
    return { label, revenue }
  })
  const maxMonthly = Math.max(...monthlyData.map(m => m.revenue), 1)

  // Per-event revenue
  const eventRevMap: Record<string, { name: string; revenue: number; count: number }> = {}
  paidRegs.forEach(r => {
    const eid = ((r as any).events as { id: string; name: string } | null)?.id || 'unknown'
    const ename = ((r as any).events as { id: string; name: string } | null)?.name || 'Unknown Event'
    if (!eventRevMap[eid]) eventRevMap[eid] = { name: ename, revenue: 0, count: 0 }
    eventRevMap[eid].revenue += Number((r.race_categories as any)?.price || 0)
    eventRevMap[eid].count++
  })
  const eventRevList = Object.values(eventRevMap).sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      <div className="absolute -top-20 left-1/2 w-[40rem] h-[20rem] bg-[#4edea3]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#4edea3]/10 text-[#6ffbbe] uppercase w-fit">
              Financial Rails
            </span>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">Financial Rails</h1>
            <p className="text-[14px] leading-[20px] text-[#cbc3d7]">Revenue overview and connected payment gateway operations.</p>
          </div>
          <button className="px-4 py-2.5 bg-[#1c1b1d] hover:bg-[#201f22] text-[#e5e1e4] text-[14px] leading-[20px] font-medium rounded-lg flex items-center gap-2 border border-[#23232b] transition-colors">
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            Export Report
          </button>
        </div>

        {/* Revenue KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium">Gross Revenue</span>
              <div className="w-9 h-9 rounded-lg bg-[#201f22] flex items-center justify-center text-[#4edea3]">
                <span className="material-symbols-outlined text-[20px]">payments</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[18px] font-semibold text-[#958ea0]">RM</span>
              <span className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-[#e5e1e4]">{grossRevenue.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#4edea3] text-[11px] mt-2">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              <span>{paidRegs.length} confirmed transactions</span>
            </div>
          </div>

          <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium">Pending Revenue</span>
              <div className="w-9 h-9 rounded-lg bg-[#201f22] flex items-center justify-center text-[#d0bcff]">
                <span className="material-symbols-outlined text-[20px]">schedule</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[18px] font-semibold text-[#958ea0]">RM</span>
              <span className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-[#e5e1e4]">{pendingRevenue.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#d0bcff] text-[11px] mt-2">
              <span className="material-symbols-outlined text-[14px]">info</span>
              <span>Awaiting payment confirmation</span>
            </div>
          </div>

          {/* Payment Rails status */}
          <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">Payment Rails</span>
              <span className="px-2 py-0.5 rounded-full bg-[#4edea3]/15 text-[#4edea3] text-[10px] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]" />
                Operational
              </span>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {[
                { label: 'FPX B2C/B2B', sublabel: 'Online Banking', badge: 'FPX' },
                { label: 'Visa / Master / Apple Pay', sublabel: 'Stripe Direct', badge: 'Cards' },
                { label: 'DuitNow QR', sublabel: 'PayNet Gateway', badge: 'QR' },
              ].map(rail => (
                <div key={rail.label} className="p-2.5 rounded-lg bg-[#201f22] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-7 rounded bg-[#2a2a2c] flex items-center justify-center text-[10px] font-bold text-[#e5e1e4]">{rail.badge}</div>
                    <div>
                      <div className="text-[12px] leading-[16px] font-semibold text-[#e5e1e4]">{rail.label}</div>
                      <div className="text-[10px] text-[#958ea0]">{rail.sublabel}</div>
                    </div>
                  </div>
                  <span className="text-[#4edea3] text-[11px] font-medium">Active</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[#23232b] flex items-center justify-between text-[11px] text-[#958ea0]">
              <span>Payout: Daily T+1 Auto</span>
              <span className="text-[#d0bcff] cursor-pointer hover:underline">Settings →</span>
            </div>
          </div>
        </div>

        {/* Monthly revenue bar chart */}
        <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">Monthly Revenue</h2>
              <p className="text-[12px] text-[#cbc3d7] mt-0.5">Last 6 months revenue trend</p>
            </div>
          </div>
          <div className="w-full h-44 flex items-end justify-between gap-3 px-2">
            {monthlyData.map(({ label, revenue }) => {
              const pct = Math.round((revenue / maxMonthly) * 100)
              const isBest = revenue === maxMonthly && revenue > 0
              return (
                <div key={label} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className={`text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity ${isBest ? 'text-[#4edea3]' : 'text-[#d0bcff]'}`}>
                    RM{(revenue / 1000).toFixed(0)}k
                  </span>
                  <div
                    className={`w-full rounded-t transition-all ${isBest ? 'bg-[#4edea3] group-hover:bg-[#6ffbbe]' : 'bg-[#d0bcff]/30 group-hover:bg-[#d0bcff]'}`}
                    style={{ height: `${Math.max(pct, 3)}%` }}
                  />
                  <span className={`text-[10px] ${isBest ? 'text-[#4edea3] font-semibold' : 'text-[#958ea0]'}`}>{label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Per-event revenue table */}
        {eventRevList.length > 0 && (
          <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#23232b] bg-[#201f22]">
              <h2 className="text-[16px] leading-[24px] font-semibold text-[#e5e1e4]">Revenue by Event</h2>
            </div>
            <div className="divide-y divide-[#23232b]">
              {eventRevList.map(({ name, revenue, count }) => (
                <div key={name} className="flex items-center justify-between px-6 py-4 hover:bg-[#201f22] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#201f22] flex items-center justify-center text-[#d0bcff]">
                      <span className="material-symbols-outlined text-[18px]">flag</span>
                    </div>
                    <div>
                      <div className="text-[14px] leading-[20px] font-medium text-[#e5e1e4]">{name}</div>
                      <div className="text-[12px] text-[#958ea0]">{count} paid registrations</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] leading-[24px] font-semibold text-[#4edea3]">RM {revenue.toLocaleString('en-MY')}</div>
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
