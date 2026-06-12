'use client'

import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { evaluateBadges } from '@/lib/badges'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, MapPin, Clock, Trophy, Trash2, Navigation, Award } from 'lucide-react'
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

    const durationSec =
      parseInt(newRun.duration_hours) * 3600 +
      parseInt(newRun.duration_minutes) * 60 +
      parseInt(newRun.duration_seconds)

    if (durationSec <= 0) {
      setSubmitting(false)
      return
    }

    const { data, error } = await supabase
      .from('run_logs')
      .insert({
        runner_id: profile.id,
        distance_km: parseFloat(newRun.distance_km),
        duration_sec: durationSec,
        pace_min_km: durationSec / 60 / parseFloat(newRun.distance_km),
        gps_data: gpsTrackDataRef.current.length > 0 ? gpsTrackDataRef.current : null,
      })
      .select()
      .single()

    if (!error && data) {
      setRunLogs([data, ...runLogs])
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
    }

    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('run_logs').delete().eq('id', id)
    setRunLogs(runLogs.filter((l) => l.id !== id))
  }

  const totalDistance = runLogs.reduce((acc, l) => acc + Number(l.distance_km || 0), 0)
  const totalTime = runLogs.reduce((acc, l) => acc + (l.duration_sec || 0), 0)

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Run Log</h1>
        <p className="text-muted-foreground">Track your virtual run progress</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Distance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {totalDistance.toFixed(1)} KM
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              {formatTime(totalTime)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              {runLogs.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {gpsRoutePoints.length >= 2 && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Your Route</CardTitle>
            <CardDescription>
              {gpsRoutePoints.length} GPS points captured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RouteMap points={gpsRoutePoints} />
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Log a Run</CardTitle>
          <CardDescription>Add your virtual run activity or start GPS tracking</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link href="/runner/run-log/track">
                <Navigation className="mr-2 h-4 w-4" />
                Start GPS Tracking
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Distance (KM)</Label>
              <Input
                type="number"
                step="0.001"
                placeholder="5.0"
                value={newRun.distance_km}
                onChange={(e) => setNewRun({ ...newRun, distance_km: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Hours</Label>
              <Input
                type="number"
                min="0"
                value={newRun.duration_hours}
                onChange={(e) => setNewRun({ ...newRun, duration_hours: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Minutes</Label>
              <Input
                type="number"
                min="0"
                max="59"
                value={newRun.duration_minutes}
                onChange={(e) => setNewRun({ ...newRun, duration_minutes: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Seconds</Label>
              <Input
                type="number"
                min="0"
                max="59"
                value={newRun.duration_seconds}
                onChange={(e) => setNewRun({ ...newRun, duration_seconds: e.target.value })}
              />
            </div>
          </div>
          <Button onClick={handleAddRun} disabled={submitting}>
            <Plus className="mr-2 h-4 w-4" />
            {submitting ? 'Logging...' : 'Log Run'}
          </Button>
        </CardContent>
      </Card>

      {newBadges.length > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Badges Earned
            </CardTitle>
            <CardDescription>Congratulations! You earned new achievements.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {newBadges.map((badge) => (
                <div
                  key={badge.badge_key}
                  className="flex items-center gap-3 rounded-lg border border-primary/30 p-3 bg-background"
                >
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-2xl shrink-0">
                    {badge.icon}
                  </div>
                  <div>
                    <p className="font-semibold">{badge.name}</p>
                    <p className="text-xs text-muted-foreground">{badge.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setNewBadges([])}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Run History</CardTitle>
          <CardDescription>Your logged activities</CardDescription>
        </CardHeader>
        <CardContent>
          {runLogs.length > 0 ? (
            <div className="space-y-4">
              {runLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                      {log.gps_data ? (
                        <Navigation className="h-6 w-6 text-primary" />
                      ) : (
                        <MapPin className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{log.distance_km} KM</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTime(log.duration_sec)}
                        <span className="mx-2">•</span>
                        {(log.pace_min_km || 0).toFixed(1)} min/km
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      {new Date(log.logged_at).toLocaleDateString()}
                    </p>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No runs logged yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
    >
      {children}
    </label>
  )
}
