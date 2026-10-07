'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ServiceNode {
  name: string
  region: string
  status: 'operational' | 'degraded' | 'unhealthy'
  latency: string
  uptime: string
  details: string
}

interface TelemetryMetrics {
  totalNodes: number
  avgLatency: number
  operationalCount: number
  degradedCount: number
  unhealthyCount: number
  uptime: string
  storageBucketsCount: number
}

export default function AdminNodesPage() {
  const [services, setServices] = useState<ServiceNode[]>([])
  const [metrics, setMetrics] = useState<TelemetryMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const fetchTelemetry = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch('/api/admin/telemetry')
      const json = await res.json()
      if (json.success) {
        setServices(json.services)
        setMetrics(json.metrics)
        setLastUpdated(new Date().toLocaleTimeString())
        if (isManual) toast.success('Telemetry probe complete')
      } else {
        toast.error(json.error || 'Failed to probe telemetry')
      }
    } catch {
      toast.error('Network error during telemetry probe')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchTelemetry()
    const interval = setInterval(() => {
      fetchTelemetry()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchTelemetry])

  const metricCards = [
    {
      label: 'Total Registered Nodes',
      value: metrics ? String(metrics.totalNodes) : '6',
      unit: 'Services',
      icon: 'hub',
      color: 'text-[#d0bcff]',
      bg: 'bg-[#d0bcff]/20',
    },
    {
      label: 'Avg Query Latency',
      value: metrics ? String(metrics.avgLatency) : '—',
      unit: 'ms',
      icon: 'speed',
      color: 'text-[#4cd7f6]',
      bg: 'bg-[#4cd7f6]/20',
    },
    {
      label: 'Fleet Health Uptime',
      value: metrics?.uptime || '99.95%',
      unit: '',
      icon: 'monitoring',
      color: 'text-[#4edea3]',
      bg: 'bg-[#4edea3]/20',
    },
    {
      label: 'Active System Alerts',
      value: metrics ? String(metrics.degradedCount + metrics.unhealthyCount) : '0',
      unit: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'Degraded' : 'Healthy',
      icon: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'warning' : 'check_circle',
      color: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'text-[#ffb4ab]' : 'text-[#4edea3]',
      bg: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'bg-[#ffb4ab]/20' : 'bg-[#4edea3]/20',
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-[#e5e1e4]">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#4edea3]">monitoring</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#4edea3]">Fleet Telemetry</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-[#e5e1e4] tracking-tight">Nodes & Telemetry</h1>
          <p className="text-[13px] text-[#958ea0]">Live distributed system metrics, PostgreSQL query ping, and infrastructure telemetry across ap-southeast-1</p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[12px] text-[#958ea0] font-mono">
              Last probe: {lastUpdated}
            </span>
          )}
          <button
            onClick={() => fetchTelemetry(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-medium hover:bg-[#353437] hover:text-[#d0bcff] transition-all border border-[#494454]/30"
          >
            <span className={`material-symbols-outlined text-[16px] ${refreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{refreshing ? 'Probing...' : 'Probe System Now'}</span>
          </button>
        </div>
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
              <span className="text-[36px] font-bold leading-none text-[#e5e1e4] font-tabular">{m.value}</span>
              {m.unit && <span className={`text-[12px] font-semibold ${m.color}`}>{m.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Services Table ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-[#494454]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">hub</span>
            <h2 className="font-jakarta font-semibold text-[18px] text-[#e5e1e4]">Service Registry & Health Check</h2>
          </div>
          <span className="text-[11px] text-[#4edea3] font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
            Auto-refresh active (30s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#494454]/30">
                {['Service', 'Region', 'Round-trip Latency', 'Availability SLA', 'Status', 'Diagnostic Details'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#353437]/30">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[#958ea0]">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-[#d0bcff] mb-2" />
                    <span>Executing live telemetry probes...</span>
                  </td>
                </tr>
              ) : (
                services.map((svc, i) => (
                  <tr key={i} className="hover:bg-[#201f22]/50 transition-colors">
                    {/* Service */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <span className={`material-symbols-outlined text-[18px] ${
                          svc.status === 'operational' ? 'text-[#4edea3]' : 'text-[#ffb4ab]'
                        }`}>
                          memory
                        </span>
                        <span className="text-[13px] font-semibold text-[#e5e1e4] font-jakarta">{svc.name}</span>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="py-4 px-5">
                      <span className="text-[12px] font-mono text-[#cbc3d7] bg-[#201f22] px-2 py-0.5 rounded border border-[#494454]/30">
                        {svc.region}
                      </span>
                    </td>

                    {/* Latency */}
                    <td className="py-4 px-5">
                      <span className="text-[13px] font-mono font-semibold text-[#4cd7f6]">{svc.latency}</span>
                    </td>

                    {/* Uptime */}
                    <td className="py-4 px-5">
                      <span className="text-[13px] font-mono text-[#cbc3d7]">{svc.uptime}</span>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 border ${
                        svc.status === 'operational'
                          ? 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20'
                          : svc.status === 'degraded'
                            ? 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20'
                            : 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          svc.status === 'operational'
                            ? 'bg-[#4edea3]'
                            : svc.status === 'degraded'
                              ? 'bg-[#f59e0b] animate-pulse'
                              : 'bg-[#ffb4ab] animate-pulse'
                        }`} />
                        {svc.status.toUpperCase()}
                      </span>
                    </td>

                    {/* Diagnostics */}
                    <td className="py-4 px-5">
                      <span className="text-[12px] text-[#958ea0] font-inter">{svc.details}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
