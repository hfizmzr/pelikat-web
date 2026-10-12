'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity, ChartLine, Cpu, Gauge, Loader2, RefreshCw } from "lucide-react"
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
      icon: Activity,
      color: 'text-primary',
      bg: 'bg-primary/20',
    },
    {
      label: 'Avg Query Latency',
      value: metrics ? String(metrics.avgLatency) : '—',
      unit: 'ms',
      icon: Gauge,
      color: 'text-primary',
      bg: 'bg-primary/20',
    },
    {
      label: 'Fleet Health Uptime',
      value: metrics?.uptime || '99.95%',
      unit: '',
      icon: ChartLine,
      color: 'text-success',
      bg: 'bg-success/20',
    },
    {
      label: 'Active System Alerts',
      value: metrics ? String(metrics.degradedCount + metrics.unhealthyCount) : '0',
      unit: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'Degraded' : 'Healthy',
      icon: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'warning' : 'check_circle',
      color: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'text-red-300' : 'text-success',
      bg: metrics && (metrics.degradedCount + metrics.unhealthyCount) > 0 ? 'bg-red-300/20' : 'bg-success/20',
    },
  ]

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="size-[16px] text-success"><ChartLine className="size-[16px] text-success" /></span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-success">Fleet Telemetry</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-foreground tracking-tight">Nodes & Telemetry</h1>
          <p className="text-[13px] text-muted-foreground">Live distributed system metrics, PostgreSQL query ping, and infrastructure telemetry across ap-southeast-1</p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[12px] text-muted-foreground font-mono">
              Last probe: {lastUpdated}
            </span>
          )}
          <button
            onClick={() => fetchTelemetry(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent hover:text-primary transition-all border border-border/30"
          >
            <span className="size-[16px] ${refreshing ? 'animate-spin' : ''}"><RefreshCw className="size-[16px] ${refreshing ? 'animate-spin' : ''}" /></span>
            <span>{refreshing ? 'Probing...' : 'Probe System Now'}</span>
          </button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        {metricCards.map((m, i) => (
          <div key={i} className="rounded-xl bg-card border border-border/30 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{m.label}</span>
              <div className={`p-1.5 rounded-lg ${m.bg} ${m.color}`}>
                <m.icon className="size-[18px]" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[36px] font-bold leading-none text-foreground font-tabular">{m.value}</span>
              {m.unit && <span className={`text-[12px] font-semibold ${m.color}`}>{m.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Services Table ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-primary size-[20px]"><Activity className="text-primary size-[20px]" /></span>
            <h2 className="font-jakarta font-semibold text-[18px] text-foreground">Service Registry & Health Check</h2>
          </div>
          <span className="text-[11px] text-success font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Auto-refresh active (30s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30">
                {['Service', 'Region', 'Round-trip Latency', 'Availability SLA', 'Status', 'Diagnostic Details'].map((h) => (
                  <th key={h} className="py-3 px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/30">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary mb-2" />
                    <span>Executing live telemetry probes...</span>
                  </td>
                </tr>
              ) : (
                services.map((svc, i) => (
                  <tr key={i} className="hover:bg-card/50 transition-colors">
                    {/* Service */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <span className="size-[18px] ${ svc.status === 'operational' ? 'text-success' : 'text-red-300' }"><Cpu className="size-[18px] ${ svc.status === 'operational' ? 'text-success' : 'text-red-300' }" /></span>
                        <span className="text-[13px] font-semibold text-foreground font-jakarta">{svc.name}</span>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="py-4 px-5">
                      <span className="text-[12px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded border border-border/30">
                        {svc.region}
                      </span>
                    </td>

                    {/* Latency */}
                    <td className="py-4 px-5">
                      <span className="text-[13px] font-mono font-semibold text-primary">{svc.latency}</span>
                    </td>

                    {/* Uptime */}
                    <td className="py-4 px-5">
                      <span className="text-[13px] font-mono text-muted-foreground">{svc.uptime}</span>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 border ${
                        svc.status === 'operational'
                          ? 'text-success bg-success/10 border-success/20'
                          : svc.status === 'degraded'
                            ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                            : 'text-red-300 bg-red-300/10 border-red-300/20'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          svc.status === 'operational'
                            ? 'bg-success'
                            : svc.status === 'degraded'
                              ? 'bg-amber-500 animate-pulse'
                              : 'bg-red-300 animate-pulse'
                        }`} />
                        {svc.status.toUpperCase()}
                      </span>
                    </td>

                    {/* Diagnostics */}
                    <td className="py-4 px-5">
                      <span className="text-[12px] text-muted-foreground font-inter">{svc.details}</span>
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
