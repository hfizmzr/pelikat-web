"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"

interface GpsPoint {
  lat: number
  lon: number
  ts: number
}

function haversineDistance(p1: GpsPoint, p2: GpsPoint): number {
  const R = 6371
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180
  const dLon = ((p2.lon - p1.lon) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type TrackerState = "idle" | "tracking" | "paused"

interface RunResult {
  distance_km: number
  duration_sec: number
  pace_min_km: number
  gps_points: GpsPoint[]
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const mm = m.toString().padStart(2, "0")
  const ss = s.toString().padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function RunnerTracker() {
  const [state, setState] = useState<TrackerState>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [gpsDistance, setGpsDistance] = useState(0)
  const [gpsPointCount, setGpsPointCount] = useState(0)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const geoWatchRef = useRef<number | null>(null)
  const pointsRef = useRef<GpsPoint[]>([])

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (geoWatchRef.current) {
      navigator.geolocation.clearWatch(geoWatchRef.current)
      geoWatchRef.current = null
    }
  }, [])

  useEffect(() => {
    return clearTimers
  }, [clearTimers])

  const accumulatePoint = useCallback((pt: GpsPoint) => {
    pointsRef.current.push(pt)
    setGpsPointCount(pointsRef.current.length)
    if (pointsRef.current.length >= 2) {
      setGpsDistance(
        (d) => d + haversineDistance(pointsRef.current[pointsRef.current.length - 2], pt)
      )
    }
  }, [])

  const startWatching = useCallback(() => {
    if ("geolocation" in navigator) {
      geoWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          accumulatePoint({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            ts: Date.now(),
          })
          setGpsAccuracy(pos.coords.accuracy)
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
      )
    }
  }, [accumulatePoint])

  const startTracking = useCallback(() => {
    pointsRef.current = []
    setGpsPointCount(0)
    setElapsed(0)
    setGpsDistance(0)

    startWatching()
    setState("tracking")
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
  }, [startWatching])

  const pauseTracking = useCallback(() => {
    clearTimers()
    setState("paused")
  }, [clearTimers])

  const resumeTracking = useCallback(() => {
    startWatching()
    setState("tracking")
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
  }, [startWatching])

  const finishTracking = useCallback(() => {
    clearTimers()
    const durationSec = elapsed
    const distKm = parseFloat(gpsDistance.toFixed(3))
    const pace = durationSec > 0 && distKm > 0 ? durationSec / 60 / distKm : 0

    const result: RunResult = {
      distance_km: distKm,
      duration_sec: durationSec,
      pace_min_km: parseFloat(pace.toFixed(2)),
      gps_points: pointsRef.current,
    }

    localStorage.setItem("tracker_result", JSON.stringify(result))
    window.location.href = "/runner/run-log"
  }, [elapsed, gpsDistance, clearTimers])

  const pace =
    elapsed > 0 && gpsDistance > 0
      ? (elapsed / 60 / gpsDistance).toFixed(1)
      : "--"

  return (
    <div className="fixed inset-0 bg-[#131315] flex flex-col z-50">
      <div className="flex items-center justify-between p-4 pt-safe">
        <Link
          href="/runner/run-log"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1c1b1d] text-[#cbc3d7] active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[24px]">close</span>
        </Link>
        <div className="flex items-center gap-2">
          {gpsAccuracy !== null && (
            <span className="rounded-full bg-[#1c1b1d] border border-[#353437] px-3 py-1 text-[11px] font-bold text-[#958ea0]">
              GPS ±{Math.round(gpsAccuracy)}m
            </span>
          )}
          {state === "tracking" && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 px-3 py-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffb4ab] opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ffb4ab]" />
              </span>
              <span className="text-[11px] font-bold text-[#ffb4ab]">REC</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {state === "idle" && (
          <div className="flex flex-col items-center gap-8 w-full max-w-sm">
            <div className="w-32 h-32 rounded-full bg-[#1c1b1d] border border-[#353437]/60 flex items-center justify-center shadow-[0_0_40px_rgba(76,215,246,0.1)] relative">
              <div className="absolute inset-0 rounded-full border border-[#4cd7f6]/20 animate-ping opacity-20" />
              <span className="material-symbols-outlined text-[48px] text-[#4cd7f6]">satellite_alt</span>
            </div>
            <div className="text-center flex flex-col gap-2">
              <h2 className="text-[24px] font-bold text-[#e5e1e4]">Ready to Run</h2>
              <p className="text-[14px] text-[#958ea0]">Your GPS route will be captured in the background.</p>
            </div>
            <button
              onClick={startTracking}
              className="mt-4 w-full py-4 rounded-xl bg-[#4edea3] text-[#003926] text-[16px] font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(78,222,163,0.3)] active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-[24px]">play_arrow</span>
              Start Run
            </button>
          </div>
        )}

        {state !== "idle" && (
          <div className="w-full max-w-md space-y-10 flex flex-col items-center">
            <div className="text-center">
              <p className="text-[72px] font-mono font-bold text-[#e5e1e4] tracking-tighter tabular-nums leading-none">
                {formatTime(elapsed)}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 w-full">
              <div className="rounded-2xl bg-[#1c1b1d] border border-[#353437]/60 p-4 flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-[24px] text-[#4cd7f6] mb-2">straighten</span>
                <p className="text-[28px] font-mono font-bold text-[#e5e1e4] leading-none">
                  {gpsDistance.toFixed(2)}
                </p>
                <p className="text-[10px] text-[#958ea0] mt-1 uppercase tracking-widest font-bold">
                  KM
                </p>
              </div>
              <div className="rounded-2xl bg-[#1c1b1d] border border-[#353437]/60 p-4 flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-[24px] text-[#d0bcff] mb-2">speed</span>
                <p className="text-[28px] font-mono font-bold text-[#e5e1e4] leading-none">
                  {pace}
                </p>
                <p className="text-[10px] text-[#958ea0] mt-1 uppercase tracking-widest font-bold">
                  /km
                </p>
              </div>
              <div className="rounded-2xl bg-[#1c1b1d] border border-[#353437]/60 p-4 flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-[24px] text-[#4edea3] mb-2">location_on</span>
                <p className="text-[28px] font-mono font-bold text-[#e5e1e4] leading-none">
                  {gpsPointCount}
                </p>
                <p className="text-[10px] text-[#958ea0] mt-1 uppercase tracking-widest font-bold">
                  PTS
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {state !== "idle" && (
        <div className="p-6 pb-12 w-full max-w-md mx-auto">
          <div className="flex gap-4">
            {state === "tracking" ? (
              <>
                <button
                  onClick={pauseTracking}
                  className="flex-1 py-4 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined text-[24px]">pause</span>
                  Pause
                </button>
                <button
                  onClick={finishTracking}
                  className="flex-[2] py-4 rounded-xl bg-[#ffb4ab] text-[#690005] text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_20px_rgba(255,180,171,0.2)]"
                >
                  <span className="material-symbols-outlined text-[24px]">stop</span>
                  Finish
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={resumeTracking}
                  className="flex-1 py-4 rounded-xl bg-[#4edea3] text-[#003926] text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_20px_rgba(78,222,163,0.2)]"
                >
                  <span className="material-symbols-outlined text-[24px]">play_arrow</span>
                  Resume
                </button>
                <button
                  onClick={finishTracking}
                  className="flex-[2] py-4 rounded-xl bg-[#ffb4ab] text-[#690005] text-[15px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_0_20px_rgba(255,180,171,0.2)]"
                >
                  <span className="material-symbols-outlined text-[24px]">stop</span>
                  Finish
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
