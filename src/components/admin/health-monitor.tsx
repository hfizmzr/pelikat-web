'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

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
    healthy:   { label: 'Healthy',   color: 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20', dot: 'bg-[#4edea3]' },
    degraded:  { label: 'Degraded',  color: 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20', dot: 'bg-[#ffb4ab]' },
    unhealthy: { label: 'Unhealthy', color: 'text-[#ffb4ab] bg-[#93000a]/20 border-[#ffb4ab]/20', dot: 'bg-[#ffb4ab] animate-pulse' },
  }
  const cfg = map[status] ?? { label: 'Unknown', color: 'text-[#958ea0] bg-[#958ea0]/10 border-[#958ea0]/20', dot: 'bg-[#958ea0]' }
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
    <div className="rounded-xl bg-[#1c1b1d] p-5 shadow-md border border-[#494454]/30 flex flex-col gap-4 font-inter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">vital_signs</span>
          <h3 className="font-semibold text-[#e5e1e4] text-[15px] font-jakarta">System Health</h3>
        </div>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] text-[12px] transition-colors border border-[#494454]/30"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      {/* Overall status */}
      {health && (
        <div className="flex items-center justify-between py-2 border-b border-[#353437]/30">
          <span className="text-[12px] text-[#958ea0]">Overall Status</span>
          <StatusChip status={health.status} />
        </div>
      )}

      {/* Checks list */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-[#d0bcff]" />
        </div>
      ) : health && Object.entries(health.checks).length > 0 ? (
        <div className="flex flex-col gap-2">
          {Object.entries(health.checks).map(([service, check]) => (
            <div
              key={service}
              className="flex items-center justify-between rounded-lg bg-[#201f22] border border-[#494454]/20 p-3"
            >
              <div>
                <p className="text-[13px] font-semibold text-[#e5e1e4] capitalize font-inter">{service}</p>
                <p className="text-[11px] text-[#958ea0] font-inter">{check.message}</p>
              </div>
              <StatusChip status={check.status} />
            </div>
          ))}
          <p className="text-[10px] text-[#494454] font-mono pt-1">
            Last checked: {new Date(health.timestamp).toLocaleString()}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-[#958ea0] py-4 text-center">Unable to fetch health status</p>
      )}
    </div>
  )
}
