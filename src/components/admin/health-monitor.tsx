'use client'

import { useState, useEffect } from 'react'
import { HeartPulse, Loader2, RefreshCw } from "lucide-react"

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  message: string
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: Record<string, HealthCheck>
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; dot: string }> = {
    healthy:   { label: 'Healthy',   color: 'text-success bg-success/10 border-success/20', dot: 'bg-success' },
    degraded:  { label: 'Degraded',  color: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/10 border-red-500/30 dark:border-red-300/20', dot: 'bg-red-500 dark:bg-red-300' },
    unhealthy: { label: 'Unhealthy', color: 'text-red-500 dark:text-red-300 bg-red-800/20 border-red-500/30 dark:border-red-300/20', dot: 'bg-red-500 dark:bg-red-300 animate-pulse' },
  }
  const cfg = map[status] ?? { label: 'Unknown', color: 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20', dot: 'bg-muted-foreground' }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 border ${cfg.color} font-inter`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function HealthMonitor() {
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<HealthResponse | null>(null)

  const fetchHealth = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth()
    return () => controller.abort()
  }, [])

  return (
    <div className="rounded-xl bg-card p-5 shadow-md border border-border/30 flex flex-col gap-4 font-inter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="text-primary size-[20px]" />
          <h3 className="font-semibold text-foreground text-[15px] font-jakarta">System Health</h3>
        </div>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-card hover:bg-accent text-muted-foreground text-[12px] transition-colors border border-border/30"
        >
          <RefreshCw className="size-[16px]" />
          Refresh
        </button>
      </div>

      {/* Overall status */}
      {health && (
        <div className="flex items-center justify-between py-2 border-b border-border/30">
          <span className="text-[12px] text-muted-foreground">Overall Status</span>
          <StatusChip status={health.status} />
        </div>
      )}

      {/* Checks list */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : health && Object.entries(health.checks).length > 0 ? (
        <div className="flex flex-col gap-2">
          {Object.entries(health.checks).map(([service, check]) => (
            <div
              key={service}
              className="flex items-center justify-between rounded-lg bg-card border border-border/20 p-3"
            >
              <div>
                <p className="text-[13px] font-semibold text-foreground capitalize font-inter">{service}</p>
                <p className="text-[11px] text-muted-foreground font-inter">{check.message}</p>
              </div>
              <StatusChip status={check.status} />
            </div>
          ))}
          <p className="text-[10px] text-border font-mono pt-1">
            Last checked: {new Date(health.timestamp).toLocaleString()}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground py-4 text-center">Unable to fetch health status</p>
      )}
    </div>
  )
}
