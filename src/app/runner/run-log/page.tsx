'use client'

import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { evaluateBadges } from '@/lib/badges'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const RouteMap = dynamic(
  () => import('@/components/gamification/route-map'),
  { ssr: false }
)

interface GpsPoint {
  lat: number
  lon: number
  ts: number
}

interface AwardedBadge {
  badge_key: string
  name: string
  description: string
  icon: string
}

interface RunLogEntry {
  id: string
  runner_id: string
  distance_km: number
  duration_sec: number
  pace_min_km: number
  gps_data: GpsPoint[] | null
  logged_at: string
}

interface RunnerProfile {
  id: string
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

export default function RunnerRunLogPage() {
  const { user } = useAuth()
  const supabase = createClient()

  const [profile, setProfile] = useState<RunnerProfile | null>(null)
  const [runLogs, setRunLogs] = useState<RunLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [newBadges, setNewBadges] = useState<AwardedBadge[]>([])
  const [gpsRoutePoints, setGpsRoutePoints] = useState<GpsPoint[]>([])

  const [newRun, setNewRun] = useState({
    distance_km: '',
    duration_hours: '0',
    duration_minutes: '0',
    duration_seconds: '0',
  })
  const [logError, setLogError] = useState<string | null>(null)

  const gpsTrackDataRef = useRef<GpsPoint[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (profile) {
        setProfile(profile as RunnerProfile)

        const { data: logs } = await supabase
          .from('run_logs')
          .select('*')
          .eq('runner_id', profile.id)
          .order('logged_at', { ascending: false })

        setRunLogs((logs as RunLogEntry[]) || [])
      }
      setLoading(false)
    }

    if (user) {
      fetchData()
    }
  }, [user, supabase])

  useEffect(() => {
    const raw = localStorage.getItem("tracker_result")
    if (raw) {
      try {
        const data = JSON.parse(raw) as {
          distance_km: number
          duration_sec: number
          pace_min_km: number
          gps_points: GpsPoint[]
        }

        gpsTrackDataRef.current = data.gps_points || []
        if (data.gps_points && data.gps_points.length >= 2) {
          setGpsRoutePoints(data.gps_points)
        }

        const h = Math.floor(data.duration_sec / 3600)
        const m = Math.floor((data.duration_sec % 3600) / 60)
        const s = data.duration_sec % 60

        setNewRun({
          distance_km: data.distance_km > 0 ? data.distance_km.toFixed(3) : "",
          duration_hours: String(h),
          duration_minutes: String(m),
          duration_seconds: String(s),
        })
      } catch {}
      localStorage.removeItem("tracker_result")
    }
  }, [])

  const handleAddRun = async () => {
    if (!profile || !newRun.distance_km || parseFloat(newRun.distance_km) <= 0) return
    setSubmitting(true)
    setLogError(null)

    const durationSec =
      parseInt(newRun.duration_hours) * 3600 +
      parseInt(newRun.duration_minutes) * 60 +
      parseInt(newRun.duration_seconds)

    if (durationSec <= 0) {
      setLogError('Enter a time greater than 0.')
      setSubmitting(false)
      return
    }

    // Server-side validation + pace calculation via log_run RPC (FR-61)
    const { data, error } = await supabase.rpc('log_run', {
      p_distance_km: parseFloat(newRun.distance_km),
      p_duration_sec: durationSec,
      p_gps_data: gpsTrackDataRef.current.length > 0 ? gpsTrackDataRef.current : null,
    })

    if (error) {
      setLogError(error.message || 'Failed to log run. Please check your values.')
      setSubmitting(false)
      return
    }

    setRunLogs([data as RunLogEntry, ...runLogs])
    gpsTrackDataRef.current = []
    setGpsRoutePoints([])

    setNewRun({
      distance_km: '',
      duration_hours: '0',
      duration_minutes: '0',
      duration_seconds: '0',
    })

    try {
      const result = await evaluateBadges(profile.id, null)
      if (result.awarded && result.awarded.length > 0) {
        setNewBadges(result.awarded)
      }
    } catch {}

    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('run_logs').delete().eq('id', id)
    setRunLogs(runLogs.filter((l) => l.id !== id))
  }

  const totalDistance = runLogs.reduce((acc, l) => acc + Number(l.distance_km || 0), 0)
  const totalTime = runLogs.reduce((acc, l) => acc + (l.duration_sec || 0), 0)

  if (loading) {
    return (
      <div className="flex flex-col w-full min-h-full bg-[#131315] items-center justify-center">
        <span className="material-symbols-outlined text-[32px] text-[#cbc3d7] animate-spin">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-[#e5e1e4] leading-tight">
              Run Log
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto pb-24">
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex flex-col gap-1 active:scale-[0.98] transition-transform">
            <span className="material-symbols-outlined text-[20px] text-[#4cd7f6] mb-1">map</span>
            <span className="text-[12px] text-[#958ea0] font-medium uppercase tracking-wider">Total Distance</span>
            <span className="text-[20px] font-extrabold text-[#e5e1e4] font-mono leading-none">{totalDistance.toFixed(1)} <span className="text-[14px]">KM</span></span>
          </div>
          <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex flex-col gap-1 active:scale-[0.98] transition-transform">
            <span className="material-symbols-outlined text-[20px] text-[#d0bcff] mb-1">schedule</span>
            <span className="text-[12px] text-[#958ea0] font-medium uppercase tracking-wider">Total Time</span>
            <span className="text-[16px] font-bold text-[#e5e1e4] mt-1 leading-none">{formatTime(totalTime)}</span>
          </div>
          <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex flex-col gap-1 col-span-2 active:scale-[0.98] transition-transform">
            <div className="flex justify-between items-center">
              <span className="material-symbols-outlined text-[20px] text-[#4edea3]">directions_run</span>
              <span className="text-[20px] font-extrabold text-[#e5e1e4] font-mono leading-none">{runLogs.length}</span>
            </div>
            <span className="text-[12px] text-[#958ea0] font-medium uppercase tracking-wider mt-2">Total Runs Logged</span>
          </div>
        </div>

        {gpsRoutePoints.length >= 2 && (
          <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-[#353437]/60 flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[#e5e1e4]">Your Last Route</h2>
              <span className="text-[10px] text-[#cbc3d7] bg-[#23232b] px-2 py-0.5 rounded uppercase tracking-wider">{gpsRoutePoints.length} Points</span>
            </div>
            <div className="p-2 aspect-video bg-[#131315]">
              <RouteMap points={gpsRoutePoints} />
            </div>
          </section>
        )}

        {/* Log a Run */}
        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-[#353437]/60">
            <h2 className="text-[14px] font-bold text-[#e5e1e4]">Log a Run</h2>
            <p className="text-[12px] text-[#958ea0]">Add your virtual run activity</p>
          </div>
          
          <div className="p-5 flex flex-col gap-4">
            <Link 
              href="/runner/run-log/track"
              className="w-full py-3.5 rounded-xl border border-[#4edea3]/40 bg-[#4edea3]/5 text-[#4edea3] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
              Start GPS Tracking
            </Link>

            <div className="w-full h-px bg-[#353437]/40 my-1 relative flex items-center justify-center">
              <span className="bg-[#1c1b1d] px-2 text-[#958ea0] text-[10px] font-bold uppercase tracking-widest absolute">or manual</span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-[#cbc3d7] ml-1 uppercase tracking-wider">Distance (KM)</label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="5.0"
                  value={newRun.distance_km}
                  onChange={(e) => setNewRun({ ...newRun, distance_km: e.target.value })}
                  className="w-full h-12 px-4 rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#cbc3d7] ml-1 uppercase tracking-wider">Hrs</label>
                  <input
                    type="number"
                    min="0"
                    value={newRun.duration_hours}
                    onChange={(e) => setNewRun({ ...newRun, duration_hours: e.target.value })}
                    className="w-full h-12 px-3 text-center rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#cbc3d7] ml-1 uppercase tracking-wider">Min</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={newRun.duration_minutes}
                    onChange={(e) => setNewRun({ ...newRun, duration_minutes: e.target.value })}
                    className="w-full h-12 px-3 text-center rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-[#cbc3d7] ml-1 uppercase tracking-wider">Sec</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={newRun.duration_seconds}
                    onChange={(e) => setNewRun({ ...newRun, duration_seconds: e.target.value })}
                    className="w-full h-12 px-3 text-center rounded-xl bg-[#23232b] border border-[#353437] text-[14px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
                  />
                </div>
              </div>
            </div>

            {logError && (
              <div className="p-3 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                {logError}
              </div>
            )}

            <button
              onClick={handleAddRun}
              disabled={submitting}
              className="w-full py-3.5 mt-2 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  Logging...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Log Run
                </>
              )}
            </button>
          </div>
        </section>

        {newBadges.length > 0 && (
          <section className="bg-[#4edea3]/10 border border-[#4edea3]/30 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#4edea3]/20 blur-2xl rounded-full -mt-10 -mr-10 pointer-events-none" />
            <div className="flex items-center gap-2 text-[#4edea3]">
              <span className="material-symbols-outlined text-[24px]">emoji_events</span>
              <h2 className="text-[16px] font-bold">Badges Earned!</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 relative z-10">
              {newBadges.map((badge) => (
                <div key={badge.badge_key} className="bg-[#131315]/80 p-3 rounded-xl border border-[#4edea3]/20 flex flex-col items-center text-center">
                  <span className="text-[24px] mb-2">{badge.icon}</span>
                  <p className="text-[12px] font-bold text-[#e5e1e4] leading-tight">{badge.name}</p>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setNewBadges([])}
              className="w-full py-2.5 rounded-lg bg-[#4edea3]/20 text-[#4edea3] text-[12px] font-bold active:scale-95 transition-transform"
            >
              Dismiss
            </button>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-[16px] font-bold text-[#e5e1e4] ml-1">Run History</h2>
          
          {runLogs.length > 0 ? (
            <div className="flex flex-col gap-3">
              {runLogs.map((log) => (
                <div key={log.id} className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      log.gps_data ? 'bg-[#4cd7f6]/10 text-[#4cd7f6]' : 'bg-[#d0bcff]/10 text-[#d0bcff]'
                    }`}>
                      <span className="material-symbols-outlined text-[20px]">
                        {log.gps_data ? 'satellite_alt' : 'directions_run'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[15px] font-bold text-[#e5e1e4]">{log.distance_km} KM</span>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#958ea0]">
                        <span>{formatTime(log.duration_sec)}</span>
                        <span>•</span>
                        <span>{(log.pace_min_km || 0).toFixed(1)} min/km</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-[10px] text-[#cbc3d7]">
                      {new Date(log.logged_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric' })}
                    </span>
                    <button 
                      onClick={() => handleDelete(log.id)}
                      className="w-8 h-8 rounded-full bg-[#ffb4ab]/10 text-[#ffb4ab] flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-8 flex flex-col items-center text-center">
              <span className="material-symbols-outlined text-[32px] text-[#353437] mb-2">history</span>
              <p className="text-[13px] text-[#958ea0]">No runs logged yet</p>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
