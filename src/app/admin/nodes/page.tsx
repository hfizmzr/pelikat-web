'use client'

import { StatusTag, statusLabel } from '@/components/ui/status-tag'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from "lucide-react"
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

  const alerts = metrics ? metrics.degradedCount + metrics.unhealthyCount : 0
  const metricCards = [
    { label: 'Services checked', value: metrics ? String(metrics.totalNodes) : '—', unit: '' },
    { label: 'Average latency', value: metrics ? String(metrics.avgLatency) : '—', unit: 'ms' },
    { label: 'Services with problems', value: metrics ? String(alerts) : '—', unit: '' },
  ]

  return (
    <div className="flex flex-col gap-8 text-foreground">
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-[28px] leading-9 font-medium text-foreground">System health</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Checked every 30 seconds</p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="font-mono text-[12px] text-muted-foreground">Last checked {lastUpdated}</span>
          )}
          <button
            onClick={() => fetchTelemetry(true)}
            disabled={refreshing}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            <span>{refreshing ? 'Checking' : 'Check now'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {metricCards.map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-[13px] text-muted-foreground">{m.label}</p>
            <p className={`mt-2 text-[32px] leading-none font-medium tabular-nums ${m.label === 'Services with problems' && alerts > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {m.value}{m.unit && <span className="ml-1 text-[14px] font-normal text-muted-foreground">{m.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* ── Services Table ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-medium text-[16px] text-foreground">Services</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30">
                {['Service', 'Region', 'Latency', 'Status', 'Details'].map((h) => (
                  <th key={h} className="py-2.5 px-5 text-[12px] font-normal text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground mb-2" />
                    <span>Checking services</span>
                  </td>
                </tr>
              ) : (
                services.map((svc, i) => (
                  <tr key={i} className="hover:bg-card/50 transition-colors">
                    {/* Service */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[14px] text-foreground">{svc.name}</span>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="py-4 px-5">
                      <span className="text-[12px] font-mono text-muted-foreground">
                        {svc.region}
                      </span>
                    </td>

                    {/* Latency */}
                    <td className="py-4 px-5">
                      <span className="text-[13px] font-mono tabular-nums text-foreground">{svc.latency}</span>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-5">
                      <StatusTag tone={svc.status === 'operational' ? 'success' : svc.status === 'degraded' ? 'warning' : 'destructive'}>
                        {statusLabel(svc.status)}
                      </StatusTag>
                    </td>

                    {/* Diagnostics */}
                    <td className="py-4 px-5">
                      <span className="text-[13px] text-muted-foreground">{svc.details}</span>
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
