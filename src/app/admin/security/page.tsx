'use client'

import { statusLabel } from '@/components/ui/status-tag'
import { useState, useEffect, useCallback } from 'react'
import type { LucideIcon } from "lucide-react"
import { BadgeCheck, History, Loader2, Lock, LogIn, RefreshCw, Shield, UserCog } from "lucide-react"
import { toast } from 'sonner'

interface IAMRole {
  role: string
  scope: string
  count: number | string
  color: string
  description: string
}

interface SecurityPolicy {
  name: string
  scope: string
  status: string
  icon: LucideIcon
  color: string
  detail: string
}

// API serves legacy string icon names; map them to Lucide components here.
const API_ICON_MAP: Record<string, LucideIcon> = {
  lock: Lock,
  verified_user: BadgeCheck,
  policy: Shield,
  encrypted: Lock,
  history: History,
  login: LogIn,
}
function resolveApiIcon(icon: LucideIcon | string): LucideIcon {
  if (typeof icon === 'string') return API_ICON_MAP[icon] ?? Shield
  return icon
}

interface SecurityStats {
  totalIdentities: number
  organizersCount: number
  runnersCount: number
  pdpaConsentRate: string
  auditLogsCount: number
}

export default function AdminSecurityPage() {
  const [roles, setRoles] = useState<IAMRole[]>([])
  const [policies, setPolicies] = useState<SecurityPolicy[]>([])
  const [stats, setStats] = useState<SecurityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchSecurityData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch('/api/admin/security')
      const json = await res.json()
      if (json.success) {
        setRoles(json.iamRoles)
        setPolicies(Array.isArray(json.policies) ? json.policies.map((p: SecurityPolicy) => ({ ...p, icon: resolveApiIcon(p.icon) })) : json.policies)
        setStats(json.stats)
        if (isManual) toast.success('Security audit refreshed')
      } else {
        toast.error(json.error || 'Failed to fetch security posture')
      }
    } catch {
      toast.error('Network error loading security posture')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchSecurityData()
  }, [fetchSecurityData])

  const metricCards = [
    {
      label: 'Accounts',
      value: stats ? stats.totalIdentities.toLocaleString() : '—',
      unit: 'Accounts',
      icon: UserCog,
      color: 'text-primary',
      bg: 'bg-primary/20',
      sub: `${stats?.organizersCount ?? 0} organizers · ${stats?.runnersCount ?? 0} runners`,
    },
    {
      label: 'PDPA consent given',
      value: stats?.pdpaConsentRate || '—',
      unit: '',
      icon: Shield,
      color: 'text-success',
      bg: 'bg-success/20',
      sub: 'Runners who agreed to the privacy notice',
    },
    {
      label: 'Audit log entries',
      value: stats ? stats.auditLogsCount.toLocaleString() : '0',
      unit: 'Events',
      icon: History,
      color: 'text-primary',
      bg: 'bg-primary/20',
      sub: 'All time',
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[28px] leading-9 font-medium text-foreground">Security</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Who can access what, and PDPA consent records</p>
        </div>

        <button
          onClick={() => fetchSecurityData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent hover:text-primary transition-[color,background-color,border-color,opacity] border border-border/30"
        >
          <RefreshCw className={`size-[16px] ${refreshing ? 'animate-spin' : ''}`} />
          <span>Re-audit access controls</span>
        </button>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {metricCards.map((m, i) => (
          <div key={i} className="rounded-xl bg-card border border-border p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">{m.label}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-medium leading-none text-foreground tabular-nums">{m.value}</span>
              {m.unit && <span className="text-[13px] text-muted-foreground">{m.unit}</span>}
            </div>
            <p className="text-[13px] text-muted-foreground">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── IAM Role Matrix ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCog className="text-primary size-[20px]" />
            <h2 className="font-jakarta font-medium text-[18px] text-foreground">IAM role access matrix</h2>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">Live identity counts</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30">
                {['Role tier', 'Access boundary scope', 'Active principals', 'Description'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[11px] font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/30 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                    <span>Auditing IAM principals...</span>
                  </td>
                </tr>
              ) : (
                roles.map((r, i) => (
                  <tr key={i} className="hover:bg-card/50 transition-colors">
                    {/* Role */}
                    <td className="py-4 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${r.color}`}>
                        {statusLabel(r.role)}
                      </span>
                    </td>

                    {/* Scope */}
                    <td className="py-4 px-5 text-muted-foreground">
                      {r.scope}
                    </td>

                    {/* Count */}
                    <td className="py-4 px-5 font-mono font-medium text-foreground">
                      {r.count}
                    </td>

                    {/* Description */}
                    <td className="py-4 px-5 text-[12px] text-muted-foreground">
                      {r.description}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Security Policy Checklist ────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-medium text-[16px] text-foreground">Security policies</h2>
        </div>

        <div className="divide-y divide-accent/30">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
              <span>Verifying compliance policies...</span>
            </div>
          ) : (
            policies.map((p, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 hover:bg-card/50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`size-[22px] ${p.color} mt-0.5`}><p.icon className="size-[22px]" /></span>
                  <div>
                    <p className="text-[14px] font-medium text-foreground font-jakarta">{p.name}</p>
                    <p className="text-[12px] text-muted-foreground font-inter">{p.detail}</p>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5">Boundary: {p.scope}</p>
                  </div>
                </div>

                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border self-start sm:self-center ${
                  p.status === 'enforced'
                    ? 'text-success bg-success/10 border-success/20'
                    : 'text-destructive bg-destructive/10 border-destructive/30 dark:border-destructive/20'
                }`}>
                  {statusLabel(p.status)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
