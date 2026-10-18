'use client'

import { useEffect, useState } from 'react'

function remainingMs(expiresAt: string) {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now())
}

export function useReservationTimer(expiresAt: string | null) {
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => setMs(remainingMs(expiresAt))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])

  return {
    // null until mounted, so server and client render the same markup
    remainingMs: ms,
    expired: ms === 0,
  }
}

export function formatCountdown(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function ReservationCountdown({ expiresAt }: { expiresAt: string }) {
  const { remainingMs, expired } = useReservationTimer(expiresAt)

  if (remainingMs === null) return <span className="font-mono">--:--</span>
  if (expired) return <span className="font-mono">expired</span>
  return <span className="font-mono tabular-nums">{formatCountdown(remainingMs)}</span>
}
