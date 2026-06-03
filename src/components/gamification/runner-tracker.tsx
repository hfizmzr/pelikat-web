"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Play, Pause, Square, X, MapPin, Clock, Gauge } from "lucide-react"

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

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const mm = m.toString().padStart(2, "0")
    const ss = s.toString().padStart(2, "0")
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  }

  const pace =
    elapsed > 0 && gpsDistance > 0
      ? (elapsed / 60 / gpsDistance).toFixed(1)
      : "--"

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4">
        <a
          href="/runner/run-log"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </a>
        <div className="flex items-center gap-2">
          {gpsAccuracy !== null && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white">
              GPS ±{Math.round(gpsAccuracy)}m
            </span>
          )}
          {state === "tracking" && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-xs font-semibold text-white">REC</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {state === "idle" && (
          <div className="flex flex-col items-center gap-8">
            <div className="rounded-full bg-white/5 p-8">
              <MapPin className="h-16 w-16 text-neutral-600" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-white">Ready to Run</h2>
              <p className="text-neutral-400">Your GPS route will be captured</p>
            </div>
            <button
              onClick={startTracking}
              className="flex items-center gap-3 rounded-full bg-green-500 px-12 py-4 text-lg font-bold text-white shadow-lg shadow-green-500/30 transition hover:bg-green-400 active:scale-95"
            >
              <Play className="h-5 w-5 fill-white" />
              Start Run
            </button>
          </div>
        )}

        {state !== "idle" && (
          <div className="w-full max-w-md space-y-10">
            <div className="text-center">
              <p className="text-8xl font-mono font-bold text-white tracking-tighter tabular-nums">
                {formatTime(elapsed)}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white/5 p-4 text-center">
                <Gauge className="mx-auto mb-2 h-5 w-5 text-neutral-500" />
                <p className="text-3xl font-mono font-bold text-white">
                  {gpsDistance.toFixed(2)}
                </p>
                <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">
                  KM
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4 text-center">
                <Clock className="mx-auto mb-2 h-5 w-5 text-neutral-500" />
                <p className="text-3xl font-mono font-bold text-white">
                  {pace}
                </p>
                <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">
                  /km
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4 text-center">
                <MapPin className="mx-auto mb-2 h-5 w-5 text-neutral-500" />
                <p className="text-3xl font-mono font-bold text-white">
                  {gpsPointCount}
                </p>
                <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">
                  PTS
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {state !== "idle" && (
        <div className="p-6 pb-10">
          <div className="mx-auto max-w-md flex gap-4">
            {state === "tracking" ? (
              <>
                <button
                  onClick={pauseTracking}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 py-4 font-semibold text-white transition hover:bg-white/20 active:scale-95"
                >
                  <Pause className="h-5 w-5" />
                  Pause
                </button>
                <button
                  onClick={finishTracking}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-red-600 py-4 font-bold text-white transition hover:bg-red-500 active:scale-95"
                >
                  <Square className="h-5 w-5 fill-white" />
                  Finish
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={resumeTracking}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 py-4 font-semibold text-white transition hover:bg-green-400 active:scale-95"
                >
                  <Play className="h-5 w-5 fill-white" />
                  Resume
                </button>
                <button
                  onClick={finishTracking}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-red-600 py-4 font-bold text-white transition hover:bg-red-500 active:scale-95"
                >
                  <Square className="h-5 w-5 fill-white" />
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
