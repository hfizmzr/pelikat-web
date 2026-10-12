import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Operations Console - Organizer Hub | Pelikat',
  description: 'Real-time event operations command center for race directors',
}

export default async function OrganizerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  // Fetch events with registrations and categories
  const [{ data: events }, { data: recentRegistrations }] = await Promise.all([
    supabase
      .from('events')
      .select(`
        id, name, status, event_date, location,
        race_categories(id, name, max_slots, bib_prefix),
        registrations(id, payment_status, checked_in)
      `)
      .eq('organizer_id', organizerId)
      .order('event_date', { ascending: true })
      .limit(10),
    supabase
      .from('registrations')
      .select(`
        id, payment_status, created_at,
        runner_profiles(full_name),
        events(name),
        race_categories(name)
      `)
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('organizers')
      .select('name')
      .eq('id', organizerId)
      .maybeSingle(),
  ])

  // Aggregate stats
  const allRegs = events?.flatMap(e => e.registrations || []) || []
  const confirmedRunners = allRegs.filter(r => r.payment_status === 'paid').length
  const checkedIn = allRegs.filter(r => r.checked_in).length
  const totalRunners = allRegs.length
  const repcRate = totalRunners > 0 ? Math.round((checkedIn / totalRunners) * 100) : 0

  // Current / upcoming event (first non-past event or latest)
  const now = new Date()
  const activeEvent = events?.find(e => new Date(e.event_date) >= now) || events?.[0]
  const daysRemaining = activeEvent
    ? Math.max(0, Math.ceil((new Date(activeEvent.event_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  // Categories for active event
  const activeCategories = activeEvent?.race_categories || []

  // Registration velocity (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: velocityData } = await supabase
    .from('registrations')
    .select('created_at')
    .eq('organizer_id', organizerId)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true })

  // Group into days for simple bar chart
  const dayMap: Record<string, number> = {}
  velocityData?.forEach(r => {
    const day = new Date(r.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' })
    dayMap[day] = (dayMap[day] || 0) + 1
  })
  const velocityDays = Object.entries(dayMap).slice(-14)
  const maxVelocity = Math.max(...velocityDays.map(([, v]) => v), 1)

  const statusColor: Record<string, string> = {
    published: 'text-[#4edea3] bg-[#4edea3]/15',
    draft: 'text-[#cbc3d7] bg-[#353437]',
    closed: 'text-[#ffb4ab] bg-[#ffb4ab]/15',
    cancelled: 'text-[#ffb4ab] bg-[#ffb4ab]/15',
  }

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      {/* Ambient blobs */}
      <div className="absolute -top-32 -left-20 w-96 h-96 bg-[#d0bcff]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 -right-20 w-[30rem] h-[30rem] bg-[#4cd7f6]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Page heading */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#d0bcff]/10 text-[#e9ddff] uppercase tracking-wider">
                Race Director Command
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#494454]" />
              <span className="text-[12px] leading-[16px] text-[#cbc3d7] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
                Live Cluster Operational
              </span>
            </div>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">
              Event Operations Console
            </h1>
          </div>

          {/* Active event selector */}
          {activeEvent && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative bg-[#1c1b1d] rounded-xl px-4 py-2.5 flex items-center gap-4 shadow-md min-w-[300px] border border-[#23232b]">
                <div className="w-10 h-10 rounded-lg bg-[#353437] flex items-center justify-center text-[#a078ff] shrink-0">
                  <span className="material-symbols-outlined text-[24px]">flag</span>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] leading-[16px] font-semibold text-[#e5e1e4] truncate">{activeEvent.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[activeEvent.status] || statusColor.draft}`}>
                      {activeEvent.status}
                    </span>
                  </div>
                  <span className="text-[12px] leading-[16px] text-[#958ea0] flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-[14px]">calendar_clock</span>
                    {daysRemaining > 0 ? `${daysRemaining} Days Remaining` : 'Today!'} • {activeEvent.location || 'TBD'}
                  </span>
                </div>
                <Link href={`/organizer/events/${activeEvent.id}`}>
                  <button className="text-[#958ea0] hover:text-[#e5e1e4] transition-colors p-1">
                    <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                  </button>
                </Link>
              </div>

              <div className="flex items-center gap-1.5">
                <Link href="/organizer/runners">
                  <button className="p-2.5 bg-[#1c1b1d] hover:bg-[#201f22] text-[#e5e1e4] rounded-lg transition-colors flex items-center justify-center shadow-sm border border-[#23232b]" title="Runner Directory">
                    <span className="material-symbols-outlined text-[20px]">badge</span>
                  </button>
                </Link>
                <Link href={`/organizer/events/${activeEvent?.id}/repc`}>
                  <button className="px-4 py-2.5 bg-[#4edea3]/20 text-[#4edea3] hover:bg-[#4edea3]/30 text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                    <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                    <span>Scanner HUD</span>
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Global search bar */}
        <div className="w-full bg-[#1c1b1d] rounded-xl p-2 border border-[#23232b] flex flex-col md:flex-row items-center justify-between gap-2 shadow-md">
          <div className="relative flex-1 w-full flex items-center gap-2">
            <span className="material-symbols-outlined text-[#958ea0] text-[20px] pl-2">search</span>
            <input
              className="w-full py-1.5 bg-transparent text-[#e5e1e4] text-[12px] leading-[16px] focus:outline-none placeholder:text-[#958ea0]"
              placeholder="Search bibs, runners, SKUs, payment IDs..."
              type="text"
            />
            <div className="flex items-center gap-1 pr-2">
              <kbd className="px-2 py-0.5 rounded bg-[#2a2a2c] border border-[#494454]/30 text-[#958ea0] text-[11px] font-mono font-medium shadow-sm">⌘K</kbd>
            </div>
          </div>
          <div className="h-6 w-px bg-[#2a2a2c] hidden md:block" />
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <span className="text-[11px] text-[#958ea0] font-medium uppercase tracking-wider shrink-0 px-1">Filter:</span>
            <button className="px-2.5 py-1 rounded-lg bg-[#a078ff] text-[#340080] text-[10px] leading-[14px] tracking-[0.05em] font-semibold shrink-0 transition-colors">All Records</button>
            {['Runners', 'Race Waves', 'Merch SKUs', 'Transactions'].map(f => (
              <button key={f} className="px-2.5 py-1 rounded-lg bg-[#201f22] text-[#cbc3d7] hover:text-[#e5e1e4] hover:bg-[#2a2a2c] text-[10px] leading-[14px] tracking-[0.05em] font-medium shrink-0 transition-colors">{f}</button>
            ))}
          </div>
        </div>

        {/* KPI Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Confirmed Runners */}
          <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium">Confirmed Runners</span>
              <div className="w-9 h-9 rounded-lg bg-[#201f22] flex items-center justify-center text-[#d0bcff]">
                <span className="material-symbols-outlined text-[20px]">group</span>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-[#e5e1e4]">{confirmedRunners.toLocaleString()}</div>
              <div className="flex items-center gap-1.5 text-[#4edea3] text-[10px] leading-[14px] font-semibold mt-1">
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                <span>{totalRunners > 0 ? `${Math.round((confirmedRunners / Math.max(totalRunners, 1)) * 100)}% paid` : 'No registrations'}</span>
                <span className="text-[#958ea0] ml-1">• {totalRunners} total</span>
              </div>
            </div>
          </div>

          {/* REPC Collection Rate */}
          <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium">REPC Collection Rate</span>
              <div className="w-9 h-9 rounded-lg bg-[#201f22] flex items-center justify-center text-[#4cd7f6]">
                <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-[#e5e1e4]">{repcRate}%</div>
              <div className="flex items-center gap-1.5 text-[#cbc3d7] text-[10px] leading-[14px] font-semibold mt-1">
                <span className="text-[#4cd7f6] font-semibold">{checkedIn.toLocaleString()}</span>
                <span>of {totalRunners.toLocaleString()} collected</span>
              </div>
            </div>
          </div>

          {/* Total Events */}
          <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[12px] leading-[16px] tracking-[0.02em] text-[#cbc3d7] uppercase font-medium">Total Events</span>
              <div className="w-9 h-9 rounded-lg bg-[#201f22] flex items-center justify-center text-[#4edea3]">
                <span className="material-symbols-outlined text-[20px]">flag</span>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[40px] leading-[44px] tracking-[-0.02em] font-bold text-[#e5e1e4]">{events?.length || 0}</div>
              <div className="flex items-center gap-1.5 text-[#4edea3] text-[10px] leading-[14px] font-semibold mt-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>{events?.filter(e => e.status === 'published').length || 0} published</span>
                <span className="text-[#958ea0] ml-1">• {events?.filter(e => e.status === 'draft').length || 0} drafts</span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Event Waves */}
        {activeCategories.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-[#e5e1e4]">Active Event Waves</h2>
                <p className="text-[12px] leading-[16px] text-[#cbc3d7] mt-0.5">Capacity distribution and live quota pacing across registered categories.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/organizer/events/${activeEvent?.id}/categories`}>
                  <button className="px-4 py-2 bg-[#1c1b1d] hover:bg-[#201f22] text-[#e5e1e4] text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-[#23232b]">
                    <span className="material-symbols-outlined text-[18px]">tune</span>
                    Category Rules
                  </button>
                </Link>
                <Link href={`/organizer/events/${activeEvent?.id}/categories`}>
                  <button className="px-4 py-2 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-[#a078ff] transition-all">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Add Wave
                  </button>
                </Link>
              </div>
            </div>

            <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {activeCategories.map((cat, i) => {
                  const colors = ['bg-[#4cd7f6]', 'bg-[#d0bcff]', 'bg-[#4edea3]', 'bg-[#958ea0]']
                  const dotColors = ['bg-[#4cd7f6]', 'bg-[#d0bcff]', 'bg-[#4edea3]', 'bg-[#958ea0]']
                  const fillPercent = cat.max_slots
                    ? Math.round((0 / cat.max_slots) * 100) // placeholder until we join regs
                    : 0
                  const isAlmostFull = fillPercent >= 90

                  return (
                    <div key={cat.id} className="p-4 rounded-xl bg-[#201f22] flex flex-col justify-between gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${dotColors[i % dotColors.length]}`} />
                            <span className="text-[12px] leading-[16px] tracking-[0.02em] text-[#e5e1e4] font-semibold">{cat.name}</span>
                          </div>
                          <span className="text-[11px] text-[#958ea0] mt-0.5 block">
                            {cat.bib_prefix || 'BIB'}-#### • {cat.max_slots || '∞'} slots
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isAlmostFull ? 'bg-[#ffb4ab]/15 text-[#ffb4ab]' : 'bg-[#4cd7f6]/15 text-[#4cd7f6]'}`}>
                          {fillPercent}%
                        </span>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-[#cbc3d7] mb-1.5 font-medium">
                          <span>0 of {cat.max_slots || '?'} slots</span>
                          <span className={isAlmostFull ? 'text-[#ffb4ab]' : 'text-[#958ea0]'}>
                            {cat.max_slots ? cat.max_slots : '?'} left
                          </span>
                        </div>
                        <div className="w-full bg-[#353437] rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${colors[i % colors.length]}`}
                            style={{ width: `${Math.max(fillPercent, 2)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {activeCategories.length === 0 && (
                  <div className="col-span-4 flex flex-col items-center justify-center py-8 text-[#958ea0]">
                    <span className="material-symbols-outlined text-[48px] mb-2">flag</span>
                    <p className="text-[14px]">No categories yet — add your first race wave</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Recent Registrations */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-[#e5e1e4]">Recent Registrations</h2>
              <p className="text-[12px] leading-[16px] text-[#cbc3d7] mt-0.5">Latest runner sign-ups across all your events.</p>
            </div>
            <Link href="/organizer/runners">
              <button className="px-4 py-2 bg-[#1c1b1d] hover:bg-[#201f22] text-[#e5e1e4] text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-[#23232b]">
                View All
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </Link>
          </div>

          <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] shadow-sm overflow-hidden">
            {recentRegistrations && recentRegistrations.length > 0 ? (
              <div className="divide-y divide-[#23232b]">
                {recentRegistrations.map((reg) => (
                  <div key={reg.id} className="flex items-center justify-between px-6 py-3 hover:bg-[#201f22] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#d0bcff]/20 flex items-center justify-center text-[#d0bcff] text-[12px] font-bold shrink-0">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(((reg as any).runner_profiles as any)?.full_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[14px] leading-[20px] font-medium text-[#e5e1e4]">
                           {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                           {((reg as any).runner_profiles as any)?.full_name || 'Unknown Runner'}
                        </span>
                        <span className="text-[12px] leading-[16px] text-[#958ea0]">
                           {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                           {((reg as any).events as any)?.name || '—'}{((reg as any).race_categories as any)?.name ? ` · ${((reg as any).race_categories as any)?.name}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-[#958ea0]">
                        {new Date(reg.created_at).toLocaleDateString('en-MY')}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        reg.payment_status === 'paid'
                          ? 'bg-[#4edea3]/15 text-[#4edea3]'
                          : reg.payment_status === 'pending'
                          ? 'bg-[#d0bcff]/15 text-[#d0bcff]'
                          : 'bg-[#ffb4ab]/15 text-[#ffb4ab]'
                      }`}>
                        {reg.payment_status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-[#958ea0]">
                <span className="material-symbols-outlined text-[48px] mb-2">badge</span>
                <p className="text-[14px]">No registrations yet</p>
                <p className="text-[12px] mt-1">Create and publish an event to start accepting runners</p>
              </div>
            )}
          </div>
        </section>

        {/* Registration Velocity Chart */}
        {velocityDays.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-[#e5e1e4]">Registration Velocity</h2>
                <p className="text-[12px] leading-[16px] text-[#cbc3d7] mt-0.5">Daily sign-up trends over the last 14 days.</p>
              </div>
              <div className="flex items-center gap-1 bg-[#1c1b1d] p-1 rounded-lg border border-[#23232b]">
                {['30 Days', '14 Days', 'Today'].map((t, i) => (
                  <button key={t} className={`px-2 py-1 text-[10px] leading-[14px] rounded font-medium transition-colors ${i === 0 ? 'bg-[#2a2a2c] text-[#e5e1e4]' : 'text-[#cbc3d7] hover:text-[#e5e1e4]'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#1c1b1d] rounded-xl p-6 border border-[#23232b] shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">Daily Signups</span>
                  <span className="text-[12px] leading-[16px] text-[#cbc3d7]">
                    {velocityData?.length || 0} registrations in the last 30 days
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#d0bcff]" />
                  <span className="text-[10px] leading-[14px] text-[#cbc3d7]">Regular</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4edea3] ml-2" />
                  <span className="text-[10px] leading-[14px] text-[#cbc3d7]">Peak</span>
                </div>
              </div>
              <div className="w-full h-44 flex items-end justify-between gap-1 pt-6 px-1">
                {velocityDays.map(([label, count]) => {
                  const isPeak = count === Math.max(...velocityDays.map(([, v]) => v))
                  const heightPct = Math.round((count / maxVelocity) * 100)
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1 group">
                      <div
                        className={`w-full rounded-t transition-all ${isPeak ? 'bg-[#4edea3] group-hover:bg-[#6ffbbe]' : 'bg-[#d0bcff]/25 group-hover:bg-[#d0bcff]'}`}
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                      <span className={`text-[9px] ${isPeak ? 'text-[#4edea3] font-semibold' : 'text-[#958ea0]'}`}>
                        {label.split(' ')[0]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Events list */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[22px] leading-[28px] tracking-[-0.015em] font-semibold text-[#e5e1e4]">Your Events</h2>
              <p className="text-[12px] leading-[16px] text-[#cbc3d7] mt-0.5">All events managed by your organization.</p>
            </div>
            <Link href="/organizer/events/new">
              <button className="px-4 py-2 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-[#a078ff] transition-all shadow-[0_0_16px_rgba(208,188,255,0.25)]">
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                Create Event
              </button>
            </Link>
          </div>

          {events && events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((event) => {
                const regs = event.registrations || []
                const paid = regs.filter((r: { payment_status: string }) => r.payment_status === 'paid').length
                const catCount = (event.race_categories || []).length

                return (
                  <Link key={event.id} href={`/organizer/events/${event.id}`} className="block group">
                    <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] overflow-hidden hover:border-[#d0bcff]/30 transition-all hover:shadow-[0_0_20px_rgba(208,188,255,0.1)]">
                      <div className="h-1.5 bg-gradient-to-r from-[#d0bcff] to-[#4cd7f6]" />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-[16px] leading-[24px] font-semibold text-[#e5e1e4] group-hover:text-[#d0bcff] transition-colors truncate">{event.name}</span>
                            <span className="text-[12px] leading-[16px] text-[#958ea0] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                              {new Date(event.event_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <span className={`shrink-0 text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold ${statusColor[event.status] || statusColor.draft}`}>
                            {event.status}
                          </span>
                        </div>
                        {event.location && (
                          <p className="text-[12px] leading-[16px] text-[#958ea0] flex items-center gap-1 mb-3">
                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                            {event.location}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[12px] leading-[16px]">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[#cbc3d7]">
                              <span className="material-symbols-outlined text-[16px]">badge</span>
                              {regs.length} runners
                            </span>
                            <span className="flex items-center gap-1 text-[#cbc3d7]">
                              <span className="material-symbols-outlined text-[16px]">flag</span>
                              {catCount} categories
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded border border-[#494454] text-[#958ea0]">
                            {paid} paid
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] p-12 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-[64px] text-[#494454] mb-4">flag</span>
              <h3 className="text-[18px] leading-[24px] font-semibold text-[#e5e1e4] mb-2">No events yet</h3>
              <p className="text-[14px] leading-[20px] text-[#958ea0] mb-6 max-w-sm">
                Create your first running event to start accepting registrations and managing participants.
              </p>
              <Link href="/organizer/events/new">
                <button className="px-6 py-2.5 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-[#a078ff] transition-all">
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Create your first event
                </button>
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-[#23232b] py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-[#958ea0] text-[12px] leading-[16px]">
          <div>Pelikat Batik Running Platform © {new Date().getFullYear()}. Enterprise Event Operations.</div>
          <div className="flex items-center gap-6">
            {['Organizer Helpdesk', 'API & Webhooks', 'Event Terms', 'Support'].map(l => (
              <span key={l} className="hover:text-[#e5e1e4] transition-colors cursor-pointer">{l}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}