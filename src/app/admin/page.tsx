import { ArrowRight, BadgeCheck, Building2, Download, ExternalLink, Footprints, Megaphone, Settings, SlidersHorizontal, ToggleRight, TriangleAlert, Zap } from "lucide-react"
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
      icon: Building2,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/20',
      glowColor: 'bg-primary/5',
      accent: 'text-success',
      sub: `+${(organizersCount ?? 0) - (activeOrganizersCount ?? 0)} total registered`,
      barColor: 'from-primary/40 to-primary',
    },
    {
      label: 'Aggregate Registrations',
      value: (registrationsCount ?? 0).toLocaleString(),
      unit: 'Athletes',
      icon: Footprints,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/20',
      glowColor: 'bg-primary/5',
      accent: 'text-primary',
      sub: 'All-time registrations',
    },
    {
      label: 'Platform Events',
      value: eventsCount ?? 0,
      unit: 'Events',
      icon: Zap,
      iconColor: 'text-success',
      iconBg: 'bg-success/20',
      glowColor: 'bg-success/5',
      accent: 'text-success',
      sub: 'All time created',
    },
  ]

  // ── Organizer initials + color ────────────────────────────────────────────
  const orgColors = [
    { bg: 'bg-primary/20', text: 'text-primary' },
    { bg: 'bg-primary/20', text: 'text-primary' },
    { bg: 'bg-success/20', text: 'text-success' },
    { bg: 'bg-red-500/10 dark:bg-red-500 dark:bg-red-300/20', text: 'text-red-500 dark:text-red-300' },
    { bg: 'bg-primary/20', text: 'text-primary' },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-jakarta font-bold text-[28px] leading-tight tracking-tight text-foreground">
            Platform Overview
          </h1>
          <p className="text-[14px] text-muted-foreground max-w-2xl font-inter">
            Cross-tenant overview across {activeOrganizersCount ?? 0} organizer accounts.
          </p>
        </div>

        {/* Header actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="/admin/audit-logs"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent hover:text-primary transition-all border border-border/30"
          >
            <Download className="size-[16px]" />
            <span>Audit Logs</span>
          </a>
          <Link
            href="/admin/organizers"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary transition-all "
          >
            <Megaphone className="size-[18px]" />
            <span>Manage Organizers</span>
          </Link>
        </div>
      </div>

      {/* ── KPI Metric Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {kpiCards.map((card, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl bg-card p-5 shadow-md flex flex-col justify-between border border-border/30 hover:bg-card transition-all group"
          >
            {/* Background glow orb */}
            <div className={`absolute top-0 right-0 w-32 h-32 ${card.glowColor} rounded-full blur-2xl pointer-events-none`} />

            {/* Top: label + icon */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-inter">
                  {card.label}
                </span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[40px] font-bold text-foreground leading-none tracking-tight font-inter font-tabular">
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
                <card.icon className="size-[22px]" />
              </div>
            </div>

            {/* Bottom: sub-info */}
            <div className="mt-4 pt-3">
              <p className={`text-[11px] font-inter ${card.accent} font-medium pt-0.5`}>
                {card.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Expiring Subscriptions Alert ─────────────────────────────────── */}
      {(expiringSoonCount ?? 0) > 0 && (
        <div className="w-full bg-red-800/10 rounded-xl p-5 border border-red-500/30 dark:border-red-500 dark:border-red-300/20 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-[20px] text-red-500 dark:text-red-300" />
            <h3 className="font-semibold text-red-500 dark:text-red-300 text-[15px] font-jakarta">
              {expiringSoonCount} Subscription(s) Expiring Within 7 Days
            </h3>
          </div>
          <div className="space-y-2">
            {expiringOrganizers?.map((org) => (
              <div key={org.slug} className="flex items-center justify-between rounded-lg bg-card border border-border/30 p-3">
                <div>
                  <p className="text-[13px] font-semibold text-foreground font-inter">{org.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">@{org.slug}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 dark:bg-red-500 dark:bg-red-300/10 text-red-500 dark:text-red-300 text-[11px] font-bold border border-red-500/30 dark:border-red-500 dark:border-red-300/20 font-inter">
                  Expires {new Date(org.sub_expires_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tenant Organizer Directory ───────────────────────────────────── */}
      <div className="w-full bg-card rounded-xl shadow-lg p-5 flex flex-col gap-4 border border-border/30">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-jakarta font-bold text-[20px] text-foreground tracking-tight">
              Tenant Organizer Directory
            </h2>
            <p className="text-[12px] text-muted-foreground mt-0.5 font-inter">
              Manage organizer accounts, tenant subscriptions, and event licensing
            </p>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <Link
              href="/admin/organizers"
              className="flex-1 lg:flex-none px-4 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground hover:text-white text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 shadow-md font-inter"
            >
              <ExternalLink className="size-[18px]" />
              Manage All Organizers
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Organization</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/30 text-[13px] font-inter">
              {!recentOrganizers || recentOrganizers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground">
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
                    <tr key={org.id} className="hover:bg-card/40 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center ${color.text} font-bold text-[12px] shrink-0 font-jakarta`}>
                            {initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold text-foreground truncate font-jakarta">{org.name}</span>
                            <span className="text-[11px] text-muted-foreground font-mono truncate">@{org.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="text-foreground font-medium truncate max-w-[180px]">
                            {org.contact_email || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {isExpired ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 dark:bg-red-500 dark:bg-red-300/10 text-red-500 dark:text-red-300 text-[11px] font-semibold inline-flex items-center gap-1.5 border border-red-500/30 dark:border-red-500 dark:border-red-300/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-300" />
                            Expired
                          </span>
                        ) : isExpiring ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 dark:bg-red-500 dark:bg-red-300/10 text-red-500 dark:text-red-300 text-[11px] font-semibold inline-flex items-center gap-1.5 border border-red-500/30 dark:border-red-500 dark:border-red-300/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-300" />
                            Expiring
                          </span>
                        ) : org.is_active ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-success/10 text-success text-[11px] font-semibold inline-flex items-center gap-1.5 border border-success/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
                            Active
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground text-[11px] font-semibold inline-flex items-center gap-1.5 border border-muted-foreground/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/organizers`}
                            className="p-1.5 rounded-lg bg-card hover:bg-primary hover:text-primary-foreground text-primary transition-all border border-border/30"
                            title="Manage"
                          >
                            <Settings className="size-[18px]" />
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
          <span className="text-muted-foreground">
            Showing {recentOrganizers?.length ?? 0} of {organizersCount ?? 0} registered event tenants
          </span>
          <Link
            href="/admin/organizers"
            className="text-primary hover:text-foreground transition-colors flex items-center gap-1 font-medium"
          >
            View All Organizers
            <ArrowRight className="size-[14px]" />
          </Link>
        </div>
      </div>

      {/* ── Dual Panel: Audit Log + Infrastructure ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* Recent Audit Log */}
        <div className="xl:col-span-7 bg-card rounded-xl p-5 shadow-md border border-border/30 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BadgeCheck className="text-success size-[20px]" />
              <h3 className="font-semibold text-foreground text-[16px] font-jakarta">Recent Audit Log</h3>
            </div>
            <Link
              href="/admin/audit-logs"
              className="text-[11px] text-primary hover:text-foreground transition-colors flex items-center gap-1 font-medium font-inter"
            >
              View Ledger
              <ArrowRight className="size-[14px]" />
            </Link>
          </div>

          <div className="divide-y divide-accent/30 text-[13px] font-inter">
            {recentAuditLogs && recentAuditLogs.length > 0 ? (
              recentAuditLogs.map((log) => {
                const time = new Date(log.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <div key={log.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground font-mono text-[11px] shrink-0">{time}</span>
                      <div className="min-w-0">
                        <span className="text-foreground font-medium capitalize">
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-success/10 text-success font-bold text-[10px] shrink-0 border border-success/20 font-inter uppercase tracking-wide">
                      SUCCESS
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="py-8 text-center text-muted-foreground">No recent audit activity</div>
            )}
          </div>
        </div>

        {/* Right Column: Health + Storage */}
        <div className="xl:col-span-5 flex flex-col gap-5">
          {/* Feature Flags Panel */}
          <div className="bg-card rounded-xl p-5 shadow-md border border-border/30 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ToggleRight className="text-primary size-[20px]" />
                <h3 className="font-semibold text-foreground text-[16px] font-jakarta">Feature Flags & Circuit</h3>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">STRICT MODE</span>
            </div>
            <div className="flex flex-col gap-3">
              {[
                {
                  name: 'AI Race Photo Indexing',
                  desc: 'Runner bib recognition engine',
                  status: flagPhotoAi ? 'Active' : 'Disabled',
                  color: flagPhotoAi
                    ? 'text-primary bg-primary/10 border-primary/20'
                    : 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20',
                },
                {
                  name: 'Virtual Run GPS Tracking',
                  desc: 'Continuous distance & pace tracking',
                  status: flagVirtualRun ? 'Active' : 'Disabled',
                  color: flagVirtualRun
                    ? 'text-primary bg-primary/10 border-primary/20'
                    : 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20',
                },
                {
                  name: 'REPC Race Pack Check-In',
                  desc: 'QR & barcode contactless distribution',
                  status: flagRepc ? 'Active' : 'Disabled',
                  color: flagRepc
                    ? 'text-success bg-success/10 border-success/20'
                    : 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20',
                },
              ].map((flag) => (
                <div key={flag.name} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-semibold text-foreground font-inter">{flag.name}</span>
                    <span className="text-[11px] text-muted-foreground font-inter">{flag.desc}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border font-inter ${flag.color}`}>
                    {flag.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${flagMaintenance ? 'bg-red-500 dark:bg-red-300 animate-pulse' : 'bg-success'}`} />
                <span className="text-[12px] text-muted-foreground font-inter">
                  Maintenance: <strong className={flagMaintenance ? 'text-red-500 dark:text-red-300' : 'text-success'}>{flagMaintenance ? 'ON' : 'OFF'}</strong>
                </span>
              </div>
              <Link
                href="/admin/settings"
                className="px-3 py-1 rounded-lg bg-card hover:bg-primary/20 hover:text-primary text-muted-foreground transition-colors text-[11px] font-medium font-inter border border-border/30 flex items-center gap-1"
              >
                <span>Configure</span>
                <SlidersHorizontal className="size-[13px]" />
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