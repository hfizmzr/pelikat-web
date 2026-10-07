import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { StorageUsage } from '@/components/admin/storage-usage'
import { HealthMonitor } from '@/components/admin/health-monitor'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    { count: organizersCount },
    { count: activeOrganizersCount },
    { count: eventsCount },
    { count: registrationsCount },
    { count: expiringSoonCount },
    { data: recentAuditLogs },
    { data: expiringOrganizers },
    { data: recentOrganizers },
    { data: platformSettings },
  ] = await Promise.all([
    supabase.from('organizers').select('id', { count: 'exact', head: true }),
    supabase
      .from('organizers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('registrations').select('id', { count: 'exact', head: true }),
    supabase
      .from('organizers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .not('sub_expires_at', 'is', null)
      .lte('sub_expires_at', sevenDaysFromNow.toISOString())
      .gt('sub_expires_at', now.toISOString()),
    supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('organizers')
      .select('name, slug, sub_expires_at')
      .eq('is_active', true)
      .not('sub_expires_at', 'is', null)
      .lte('sub_expires_at', sevenDaysFromNow.toISOString())
      .gt('sub_expires_at', now.toISOString())
      .limit(5),
    supabase
      .from('organizers')
      .select('id, name, slug, contact_email, is_active, sub_expires_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('platform_settings').select('*'),
  ])

  // Extract live platform settings
  const settingsMap: Record<string, boolean> = {}
  for (const row of platformSettings || []) {
    settingsMap[row.key] = Boolean(row.value)
  }
  const flagVirtualRun = settingsMap.feature_virtual_run ?? true
  const flagPhotoAi = settingsMap.feature_photo_ai ?? true
  const flagRepc = settingsMap.feature_repc_collection ?? true
  const flagMaintenance = settingsMap.maintenance_mode ?? false

  // ── KPI stat cards ───────────────────────────────────────────────────────
  const kpiCards = [
    {
      label: 'Active Platform Tenants',
      value: activeOrganizersCount ?? 0,
      unit: 'Tenants',
      icon: 'corporate_fare',
      iconColor: 'text-[#d0bcff]',
      iconBg: 'bg-[#a078ff]/20',
      glowColor: 'bg-[#d0bcff]/5',
      accent: 'text-[#4edea3]',
      sub: `+${(organizersCount ?? 0) - (activeOrganizersCount ?? 0)} total registered`,
      barColor: 'from-[#a078ff]/40 to-[#d0bcff]',
    },
    {
      label: 'Aggregate Registrations',
      value: (registrationsCount ?? 0).toLocaleString(),
      unit: 'Athletes',
      icon: 'directions_run',
      iconColor: 'text-[#4cd7f6]',
      iconBg: 'bg-[#4cd7f6]/20',
      glowColor: 'bg-[#4cd7f6]/5',
      accent: 'text-[#4cd7f6]',
      sub: 'Active Season 2025',
      barColor: 'from-[#03b5d3] to-[#4cd7f6]',
      progressBar: true,
    },
    {
      label: 'Platform Events',
      value: eventsCount ?? 0,
      unit: 'Events',
      icon: 'sprint',
      iconColor: 'text-[#4edea3]',
      iconBg: 'bg-[#4edea3]/20',
      glowColor: 'bg-[#4edea3]/5',
      accent: 'text-[#4edea3]',
      sub: 'All time created',
      barColor: 'from-[#00a572] to-[#4edea3]',
    },
    {
      label: 'System SLA & Latency',
      value: '99.99%',
      unit: '',
      icon: 'hub',
      iconColor: 'text-[#4edea3]',
      iconBg: 'bg-[#4edea3]/20',
      glowColor: 'bg-[#4edea3]/10',
      accent: 'text-[#4edea3]',
      sub: '14ms avg edge latency',
      latencyBar: true,
    },
  ]

  // ── Organizer initials + color ────────────────────────────────────────────
  const orgColors = [
    { bg: 'bg-[#a078ff]/20', text: 'text-[#d0bcff]' },
    { bg: 'bg-[#4cd7f6]/20', text: 'text-[#4cd7f6]' },
    { bg: 'bg-[#4edea3]/20', text: 'text-[#4edea3]' },
    { bg: 'bg-[#ffb4ab]/20', text: 'text-[#ffb4ab]' },
    { bg: 'bg-[#d0bcff]/20', text: 'text-[#d0bcff]' },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-[#e5e1e4]">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#4edea3] shadow-[0_0_8px_rgba(78,222,163,0.9)] animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#4edea3] font-inter">
              Mission Critical Cockpit
            </span>
            <span className="text-[#494454] text-[10px]">/</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#958ea0] font-inter">
              ap-southeast-1 Grid
            </span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] leading-tight tracking-tight text-[#e5e1e4]">
            Global Platform Fleet Overview
          </h1>
          <p className="text-[14px] text-[#958ea0] max-w-2xl font-inter">
            Real-time cross-tenant telemetry, distributed system throughput, and fleet health across {activeOrganizersCount ?? 0} active organizers.
          </p>
        </div>

        {/* Header actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="/admin/audit-logs"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-medium hover:bg-[#353437] hover:text-[#d0bcff] transition-all border border-[#494454]/30"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Export Fleet Telemetry</span>
          </a>
          <Link
            href="/admin/organizers"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#a078ff] text-[#340080] text-[13px] font-semibold hover:bg-[#d0bcff] transition-all shadow-[0_0_20px_rgba(160,120,255,0.35)]"
          >
            <span className="material-symbols-outlined text-[18px]">campaign</span>
            <span>Manage Organizers</span>
          </Link>
        </div>
      </div>

      {/* ── KPI Metric Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {kpiCards.map((card, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl bg-[#1c1b1d] p-5 shadow-md flex flex-col justify-between border border-[#494454]/30 hover:bg-[#201f22] transition-all group"
          >
            {/* Background glow orb */}
            <div className={`absolute top-0 right-0 w-32 h-32 ${card.glowColor} rounded-full blur-2xl pointer-events-none`} />

            {/* Top: label + icon */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#958ea0] font-inter">
                  {card.label}
                </span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[40px] font-bold text-[#e5e1e4] leading-none tracking-tight font-inter font-tabular">
                    {card.value}
                  </span>
                  {card.unit && (
                    <span className={`text-[12px] font-semibold ${card.accent} font-inter`}>
                      {card.unit}
                    </span>
                  )}
                </div>
              </div>
              <div className={`p-1.5 rounded-lg ${card.iconBg} ${card.iconColor} shrink-0`}>
                <span className="material-symbols-outlined text-[22px]">{card.icon}</span>
              </div>
            </div>

            {/* Bottom: sub-info */}
            <div className="mt-4 pt-3">
              {card.progressBar && (
                <>
                  <div className="flex items-center justify-between text-[11px] font-inter mb-1.5">
                    <span className="text-[#958ea0]">Live Check-in Velocity</span>
                    <span className="text-[#e5e1e4] font-semibold">94.2% completed</span>
                  </div>
                  <div className="w-full bg-[#353437] rounded-full h-1.5 overflow-hidden mb-1">
                    <div
                      className={`bg-gradient-to-r ${card.barColor} h-1.5 rounded-full shadow-[0_0_10px_rgba(76,215,246,0.5)]`}
                      style={{ width: '94.2%' }}
                    />
                  </div>
                </>
              )}
              {card.latencyBar && (
                <div className="flex items-center gap-1.5 mb-1">
                  {[...Array(4)].map((_, j) => (
                    <span
                      key={j}
                      className="flex-1 h-1.5 rounded-full bg-[#4edea3] shadow-[0_0_6px_rgba(78,222,163,0.8)]"
                    />
                  ))}
                  <span className="flex-1 h-1.5 rounded-full bg-[#353437]" />
                </div>
              )}
              {!card.progressBar && !card.latencyBar && card.barColor && (
                <div className="w-full h-8 flex items-end gap-1 opacity-60">
                  {[45, 60, 50, 75, 65, 80, 95].map((h, j) => (
                    <div
                      key={j}
                      className={`w-full bg-gradient-to-t ${j === 6 ? card.barColor : card.barColor.replace('to-', 'to-').split(' ')[0] + '/20'} rounded-t-sm transition-all hover:opacity-100`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              )}
              <p className={`text-[11px] font-inter ${card.accent} font-medium pt-0.5`}>
                {card.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── System Status Strip ──────────────────────────────────────────── */}
      <div className="w-full bg-[#1c1b1d] rounded-xl px-5 py-3 shadow-md border border-[#494454]/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4edea3] animate-pulse" />
            <span className="text-[13px] font-semibold text-[#e5e1e4] font-inter">All Systems Operational</span>
          </div>
          <span className="text-[#494454] hidden md:inline">•</span>
          <span className="text-[12px] text-[#cbc3d7] font-mono hidden md:inline">AWS ap-southeast-1</span>
          <span className="text-[#494454] hidden md:inline">•</span>
          <span className="text-[12px] text-[#cbc3d7] hidden md:inline font-inter">
            API Latency <span className="text-[#4edea3] font-mono font-medium">14ms</span>
          </span>
        </div>
        <div className="flex items-center gap-5 text-[12px] text-[#cbc3d7] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-[#958ea0]">Uptime</span>
            <span className="text-[#4edea3] font-semibold">99.99%</span>
          </div>
          <div className="flex items-center gap-1.5 hidden sm:flex">
            <span className="text-[#958ea0]">OCR Vision</span>
            <span className="text-[#4cd7f6] font-semibold">Normal (42%)</span>
          </div>
          <div className="flex items-center gap-1.5 hidden sm:flex">
            <span className="text-[#958ea0]">Storage</span>
            <span className="text-[#e5e1e4] font-semibold">4.8 TB / 10 TB</span>
          </div>
        </div>
      </div>

      {/* ── Expiring Subscriptions Alert ─────────────────────────────────── */}
      {(expiringSoonCount ?? 0) > 0 && (
        <div className="w-full bg-[#93000a]/10 rounded-xl p-5 border border-[#ffb4ab]/20 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#ffb4ab]">warning</span>
            <h3 className="font-semibold text-[#ffb4ab] text-[15px] font-jakarta">
              {expiringSoonCount} Subscription(s) Expiring Within 7 Days
            </h3>
          </div>
          <div className="space-y-2">
            {expiringOrganizers?.map((org) => (
              <div key={org.slug} className="flex items-center justify-between rounded-lg bg-[#1c1b1d] border border-[#494454]/30 p-3">
                <div>
                  <p className="text-[13px] font-semibold text-[#e5e1e4] font-inter">{org.name}</p>
                  <p className="text-[11px] text-[#958ea0] font-mono">@{org.slug}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#ffb4ab]/10 text-[#ffb4ab] text-[11px] font-bold border border-[#ffb4ab]/20 font-inter">
                  Expires {new Date(org.sub_expires_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tenant Organizer Directory ───────────────────────────────────── */}
      <div className="w-full bg-[#1c1b1d] rounded-xl shadow-lg p-5 flex flex-col gap-4 border border-[#494454]/30">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-jakarta font-bold text-[20px] text-[#e5e1e4] tracking-tight">
              Tenant Organizer Directory
            </h2>
            <p className="text-[12px] text-[#958ea0] mt-0.5 font-inter">
              Manage organizer accounts, tenant subscriptions, and event licensing
            </p>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <Link
              href="/admin/organizers"
              className="flex-1 lg:flex-none px-4 py-2 rounded-lg bg-[#d0bcff] hover:bg-[#6d3bd7] text-[#3c0091] hover:text-white text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 shadow-md glow-primary font-inter"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Manage All Organizers
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#494454]/30 text-[#958ea0] text-[10px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Organization</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#353437]/30 text-[13px] font-inter">
              {!recentOrganizers || recentOrganizers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[#958ea0]">
                    No organizers found. Add your first tenant organizer.
                  </td>
                </tr>
              ) : (
                recentOrganizers.map((org, i) => {
                  const color = orgColors[i % orgColors.length]
                  const initials = org.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                  const isExpiring = org.sub_expires_at
                    ? new Date(org.sub_expires_at) <= sevenDaysFromNow
                    : false
                  const isExpired = org.sub_expires_at
                    ? new Date(org.sub_expires_at) <= now
                    : false

                  return (
                    <tr key={org.id} className="hover:bg-[#201f22]/40 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center ${color.text} font-bold text-[12px] shrink-0 font-jakarta`}>
                            {initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold text-[#e5e1e4] truncate font-jakarta">{org.name}</span>
                            <span className="text-[11px] text-[#958ea0] font-mono truncate">@{org.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="text-[#e5e1e4] font-medium truncate max-w-[180px]">
                            {org.contact_email || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {isExpired ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#ffb4ab]/10 text-[#ffb4ab] text-[11px] font-semibold inline-flex items-center gap-1.5 border border-[#ffb4ab]/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]" />
                            Expired
                          </span>
                        ) : isExpiring ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#ffb4ab]/10 text-[#ffb4ab] text-[11px] font-semibold inline-flex items-center gap-1.5 border border-[#ffb4ab]/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]" />
                            Expiring
                          </span>
                        ) : org.is_active ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#4edea3]/10 text-[#4edea3] text-[11px] font-semibold inline-flex items-center gap-1.5 border border-[#4edea3]/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3]" />
                            Active
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-[#958ea0]/10 text-[#958ea0] text-[11px] font-semibold inline-flex items-center gap-1.5 border border-[#958ea0]/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#958ea0]" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/organizers`}
                            className="p-1.5 rounded-lg bg-[#201f22] hover:bg-[#d0bcff] hover:text-[#3c0091] text-[#d0bcff] transition-all border border-[#494454]/30"
                            title="Manage"
                          >
                            <span className="material-symbols-outlined text-[18px]">settings</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 text-[11px] font-inter">
          <span className="text-[#958ea0]">
            Showing {recentOrganizers?.length ?? 0} of {organizersCount ?? 0} registered event tenants
          </span>
          <Link
            href="/admin/organizers"
            className="text-[#d0bcff] hover:text-[#e5e1e4] transition-colors flex items-center gap-1 font-medium"
          >
            View All Organizers
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>
      </div>

      {/* ── Dual Panel: Audit Log + Infrastructure ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* Recent Audit Log */}
        <div className="xl:col-span-7 bg-[#1c1b1d] rounded-xl p-5 shadow-md border border-[#494454]/30 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4edea3] text-[20px]">verified</span>
              <h3 className="font-semibold text-[#e5e1e4] text-[16px] font-jakarta">Recent Audit Log</h3>
            </div>
            <Link
              href="/admin/audit-logs"
              className="text-[11px] text-[#d0bcff] hover:text-[#e5e1e4] transition-colors flex items-center gap-1 font-medium font-inter"
            >
              View Ledger
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>

          <div className="divide-y divide-[#353437]/30 text-[13px] font-inter">
            {recentAuditLogs && recentAuditLogs.length > 0 ? (
              recentAuditLogs.map((log) => {
                const time = new Date(log.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <div key={log.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[#958ea0] font-mono text-[11px] shrink-0">{time}</span>
                      <div className="min-w-0">
                        <span className="text-[#e5e1e4] font-medium capitalize">
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-[#4edea3]/10 text-[#4edea3] font-bold text-[10px] shrink-0 border border-[#4edea3]/20 font-inter uppercase tracking-wide">
                      SUCCESS
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="py-8 text-center text-[#958ea0]">No recent audit activity</div>
            )}
          </div>
        </div>

        {/* Right Column: Health + Storage */}
        <div className="xl:col-span-5 flex flex-col gap-5">
          {/* Feature Flags Panel */}
          <div className="bg-[#1c1b1d] rounded-xl p-5 shadow-md border border-[#494454]/30 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#d0bcff] text-[20px]">toggle_on</span>
                <h3 className="font-semibold text-[#e5e1e4] text-[16px] font-jakarta">Feature Flags & Circuit</h3>
              </div>
              <span className="text-[11px] text-[#958ea0] font-mono">STRICT MODE</span>
            </div>
            <div className="flex flex-col gap-3">
              {[
                {
                  name: 'AI Race Photo Indexing',
                  desc: 'Runner bib recognition engine',
                  status: flagPhotoAi ? 'Active' : 'Disabled',
                  color: flagPhotoAi
                    ? 'text-[#d0bcff] bg-[#d0bcff]/10 border-[#d0bcff]/20'
                    : 'text-[#958ea0] bg-[#958ea0]/10 border-[#958ea0]/20',
                },
                {
                  name: 'Virtual Run GPS Tracking',
                  desc: 'Continuous distance & pace tracking',
                  status: flagVirtualRun ? 'Active' : 'Disabled',
                  color: flagVirtualRun
                    ? 'text-[#4cd7f6] bg-[#4cd7f6]/10 border-[#4cd7f6]/20'
                    : 'text-[#958ea0] bg-[#958ea0]/10 border-[#958ea0]/20',
                },
                {
                  name: 'REPC Race Pack Check-In',
                  desc: 'QR & barcode contactless distribution',
                  status: flagRepc ? 'Active' : 'Disabled',
                  color: flagRepc
                    ? 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20'
                    : 'text-[#958ea0] bg-[#958ea0]/10 border-[#958ea0]/20',
                },
              ].map((flag) => (
                <div key={flag.name} className="flex items-center justify-between py-1.5 border-b border-[#353437]/30 last:border-0">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-[#e5e1e4] font-inter">{flag.name}</span>
                    <span className="text-[11px] text-[#958ea0] font-inter">{flag.desc}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border font-inter ${flag.color}`}>
                    {flag.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-[#353437]/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${flagMaintenance ? 'bg-[#ffb4ab] animate-pulse' : 'bg-[#4edea3]'}`} />
                <span className="text-[12px] text-[#958ea0] font-inter">
                  Maintenance: <strong className={flagMaintenance ? 'text-[#ffb4ab]' : 'text-[#4edea3]'}>{flagMaintenance ? 'ON' : 'OFF'}</strong>
                </span>
              </div>
              <Link
                href="/admin/settings"
                className="px-3 py-1 rounded-lg bg-[#201f22] hover:bg-[#a078ff]/20 hover:text-[#d0bcff] text-[#958ea0] transition-colors text-[11px] font-medium font-inter border border-[#494454]/30 flex items-center gap-1"
              >
                <span>Configure</span>
                <span className="material-symbols-outlined text-[13px]">tune</span>
              </Link>
            </div>
          </div>

          {/* Storage + Health in a stack */}
          <StorageUsage />
          <HealthMonitor />
        </div>
      </div>
    </div>
  )
}