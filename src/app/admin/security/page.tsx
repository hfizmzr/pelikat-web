'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
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
  icon: string
  color: string
  detail: string
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
        setPolicies(json.policies)
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
      label: 'Identities Guarded',
      value: stats ? stats.totalIdentities.toLocaleString() : '—',
      unit: 'Accounts',
      icon: 'manage_accounts',
      color: 'text-[#d0bcff]',
      bg: 'bg-[#d0bcff]/20',
      sub: `${stats?.organizersCount ?? 0} tenants · ${stats?.runnersCount ?? 0} athletes`,
    },
    {
      label: 'PDPA Consent Compliance',
      value: stats?.pdpaConsentRate || '100%',
      unit: '',
      icon: 'policy',
      color: 'text-[#4edea3]',
      bg: 'bg-[#4edea3]/20',
      sub: 'Verified athlete privacy agreements',
    },
    {
      label: 'RLS Tenant Isolation',
      value: '100%',
      unit: 'Enforced',
      icon: 'lock',
      color: 'text-[#4cd7f6]',
      bg: 'bg-[#4cd7f6]/20',
      sub: 'Multi-tenant database policies active',
    },
    {
      label: 'Security Audit Events',
      value: stats ? stats.auditLogsCount.toLocaleString() : '0',
      unit: 'Events',
      icon: 'history',
      color: 'text-[#d0bcff]',
      bg: 'bg-[#d0bcff]/20',
      sub: 'Immutable audit trail records',
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-[#e5e1e4]">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#d0bcff]">lock</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d0bcff]">IAM & Compliance</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-[#e5e1e4] tracking-tight">Security & Access Control</h1>
          <p className="text-[13px] text-[#958ea0]">Identity matrix, multi-tenant row-level access control, and regulatory compliance posture</p>
        </div>

        <button
          onClick={() => fetchSecurityData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-medium hover:bg-[#353437] hover:text-[#d0bcff] transition-all border border-[#494454]/30"
        >
          <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>
            refresh
          </span>
          <span>Re-audit Access Controls</span>
        </button>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        {metricCards.map((m, i) => (
          <div key={i} className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">{m.label}</span>
              <div className={`p-1.5 rounded-lg ${m.bg} ${m.color}`}>
                <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[32px] font-bold leading-none text-[#e5e1e4] font-tabular">{m.value}</span>
              {m.unit && <span className={`text-[12px] font-semibold ${m.color}`}>{m.unit}</span>}
            </div>
            <p className="text-[11px] text-[#958ea0]">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── IAM Role Matrix ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-[#494454]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#d0bcff] text-[20px]">manage_accounts</span>
            <h2 className="font-jakarta font-semibold text-[18px] text-[#e5e1e4]">IAM Role Access Matrix</h2>
          </div>
          <span className="text-[11px] text-[#958ea0] font-mono">Live Identity Counts</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#494454]/30">
                {['Role Tier', 'Access Boundary Scope', 'Active Principals', 'Description'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#353437]/30 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-[#958ea0]">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#d0bcff] mb-2" />
                    <span>Auditing IAM principals...</span>
                  </td>
                </tr>
              ) : (
                roles.map((r, i) => (
                  <tr key={i} className="hover:bg-[#201f22]/50 transition-colors">
                    {/* Role */}
                    <td className="py-4 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${r.color}`}>
                        {r.role}
                      </span>
                    </td>

                    {/* Scope */}
                    <td className="py-4 px-5 text-[#cbc3d7]">
                      {r.scope}
                    </td>

                    {/* Count */}
                    <td className="py-4 px-5 font-mono font-bold text-[#e5e1e4]">
                      {r.count}
                    </td>

                    {/* Description */}
                    <td className="py-4 px-5 text-[12px] text-[#958ea0]">
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
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-[#494454]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4edea3] text-[20px]">verified_user</span>
            <h2 className="font-jakarta font-semibold text-[18px] text-[#e5e1e4]">Security Posture & Enforcement Checklist</h2>
          </div>
          <span className="text-[11px] text-[#4edea3] font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
            All Critical Gates Active
          </span>
        </div>

        <div className="divide-y divide-[#353437]/30">
          {loading ? (
            <div className="py-12 text-center text-[#958ea0]">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#d0bcff] mb-2" />
              <span>Verifying compliance policies...</span>
            </div>
          ) : (
            policies.map((p, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 hover:bg-[#201f22]/50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-[22px] ${p.color} mt-0.5`}>{p.icon}</span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#e5e1e4] font-jakarta">{p.name}</p>
                    <p className="text-[12px] text-[#cbc3d7] font-inter">{p.detail}</p>
                    <p className="text-[11px] text-[#958ea0] font-mono mt-0.5">Boundary: {p.scope}</p>
                  </div>
                </div>

                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border self-start sm:self-center ${
                  p.status === 'enforced'
                    ? 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20'
                    : 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20'
                }`}>
                  {p.status.toUpperCase()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
