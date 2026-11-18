import { statusLabel } from '@/components/ui/status-tag'
import { ArrowRight, BadgeCheck, Settings, SlidersHorizontal, ToggleRight, TriangleAlert } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import { countAllRegistrationsForAdmin } from '@/lib/supabase/admin-counts'
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
    registrationsCount,
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
    // No admin RLS read on registrations (by design): counted via the
    // service role behind a server-side admin check, like the admin API.
    countAllRegistrationsForAdmin(supabase),
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
      label: 'Active organizers',
      value: (activeOrganizersCount ?? 0).toLocaleString(),
      sub: `${(organizersCount ?? 0).toLocaleString()} registered in total`,
    },
    {
      label: 'Registrations',
      value: (registrationsCount ?? 0).toLocaleString(),
      sub: 'All time, across every event',
    },
    {
      label: 'Events',
      value: (eventsCount ?? 0).toLocaleString(),
      sub: 'All time',
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Overview</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Across {activeOrganizersCount ?? 0} active organizers
          </p>
        </div>
        <Link
          href="/admin/audit-logs"
          className="flex h-9 w-fit items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          Audit log
          <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kpiCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-[13px] text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-[32px] leading-none font-medium tabular-nums text-foreground">{card.value}</p>
            <p className="mt-2 text-[13px] text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Expiring Subscriptions Alert ─────────────────────────────────── */}
      {(expiringSoonCount ?? 0) > 0 && (
        <div className="w-full rounded-xl border border-warning/30 bg-warning/5 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-[18px] text-warning" strokeWidth={1.75} />
            <h3 className="font-medium text-foreground text-[15px]">
              {expiringSoonCount} {expiringSoonCount === 1 ? 'subscription expires' : 'subscriptions expire'} within 7 days
            </h3>
          </div>
          <div className="space-y-2">
            {expiringOrganizers?.map((org) => (
              <div key={org.slug} className="flex items-center justify-between rounded-lg bg-card border border-border/30 p-3">
                <div>
                  <p className="text-[13px] font-medium text-foreground font-inter">{org.name}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">@{org.slug}</p>
                </div>
                <span className="text-[12px] tabular-nums text-warning">
                  Expires {new Date(org.sub_expires_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tenant Organizer Directory ───────────────────────────────────── */}
      <div className="w-full bg-card rounded-xl p-5 flex flex-col gap-4 border border-border">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-[16px] text-foreground">Organizers</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">Most recently added accounts and their subscription status</p>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <Link
              href="/admin/organizers"
              className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              All organizers
              <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground text-[11px] font-medium">
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
                    No organizers yet
                  </td>
                </tr>
              ) : (
                recentOrganizers.map((org) => {
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
                          <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-foreground font-medium text-[12px] shrink-0">
                            {initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-medium text-foreground truncate font-jakarta">{org.name}</span>
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
                          <span className="px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium inline-flex items-center gap-1.5 border border-destructive/30 dark:border-destructive/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                            Expired
                          </span>
                        ) : isExpiring ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-medium inline-flex items-center gap-1.5 border border-destructive/30 dark:border-destructive/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                            Expiring
                          </span>
                        ) : org.is_active ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-success/10 text-success text-[11px] font-medium inline-flex items-center gap-1.5 border border-success/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
                            Active
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground text-[11px] font-medium inline-flex items-center gap-1.5 border border-muted-foreground/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/organizers`}
                            className="p-1.5 rounded-lg bg-card hover:opacity-90 hover:text-primary-foreground text-primary transition-[color,background-color,border-color,opacity] border border-border/30"
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
            Showing {recentOrganizers?.length ?? 0} of {organizersCount ?? 0} organizers
          </span>
          <Link
            href="/admin/organizers"
            className="text-primary hover:text-foreground transition-colors flex items-center gap-1 font-medium"
          >
            View all organizers
            <ArrowRight className="size-[14px]" />
          </Link>
        </div>
      </div>

      {/* ── Dual Panel: Audit Log + Infrastructure ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* Recent Audit Log */}
        <div className="xl:col-span-7 bg-card rounded-xl p-5 border border-border flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BadgeCheck className="text-success size-[20px]" />
              <h3 className="font-medium text-foreground text-[16px] font-jakarta">Recent audit log</h3>
            </div>
            <Link
              href="/admin/audit-logs"
              className="text-[11px] text-primary hover:text-foreground transition-colors flex items-center gap-1 font-medium font-inter"
            >
              View ledger
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
          <div className="bg-card rounded-xl p-5 border border-border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ToggleRight className="text-primary size-[20px]" />
                <h3 className="font-medium text-foreground text-[16px]">Feature flags</h3>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {[
                {
                  name: 'AI race photo indexing',
                  desc: 'Runner bib recognition engine',
                  status: flagPhotoAi ? 'Active' : 'Disabled',
                  color: flagPhotoAi
                    ? 'text-primary bg-primary/10 border-primary/20'
                    : 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20',
                },
                {
                  name: 'Virtual run GPS tracking',
                  desc: 'Continuous distance & pace tracking',
                  status: flagVirtualRun ? 'Active' : 'Disabled',
                  color: flagVirtualRun
                    ? 'text-primary bg-primary/10 border-primary/20'
                    : 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20',
                },
                {
                  name: 'REPC race pack check-in',
                  desc: 'QR & barcode contactless distribution',
                  status: flagRepc ? 'Active' : 'Disabled',
                  color: flagRepc
                    ? 'text-success bg-success/10 border-success/20'
                    : 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20',
                },
              ].map((flag) => (
                <div key={flag.name} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-foreground font-inter">{flag.name}</span>
                    <span className="text-[11px] text-muted-foreground font-inter">{flag.desc}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border font-inter ${flag.color}`}>
                    {statusLabel(flag.status)}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${flagMaintenance ? 'bg-destructive animate-pulse' : 'bg-success'}`} />
                <span className="text-[12px] text-muted-foreground font-inter">
                  Maintenance: <strong className={flagMaintenance ? 'text-destructive' : 'text-success'}>{flagMaintenance ? 'On' : 'Off'}</strong>
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