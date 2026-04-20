'use client'

import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, MapPin, Clock, Trophy, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function RunnerRunLogPage() {
  const { user } = useAuth()
  const supabase = createClient()
  
  const [profile, setProfile] = useState<any>(null)
  const [runLogs, setRunLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [newRun, setNewRun] = useState({
    distance_km: '',
    duration_hours: '0',
    duration_minutes: '0',
    duration_seconds: '0',
  })

  useEffect(() => {
    const fetchData = async () => {
      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (profile) {
        setProfile(profile)
        
        const { data: logs } = await supabase
          .from('run_logs')
          .select('*')
          .eq('runner_id', profile.id)
          .order('logged_at', { ascending: false })

        setRunLogs(logs || [])
      }
      setLoading(false)
    }

    if (user) {
      fetchData()
    }
  }, [user])

  const handleAddRun = async () => {
    if (!profile || !newRun.distance_km) return

    const durationSec = 
      parseInt(newRun.duration_hours) * 3600 + 
      parseInt(newRun.duration_minutes) * 60 + 
      parseInt(newRun.duration_seconds)

    const { data, error } = await supabase
      .from('run_logs')
      .insert({
        runner_id: profile.id,
        distance_km: parseFloat(newRun.distance_km),
        duration_sec: durationSec,
        pace_min_km: durationSec / 60 / parseFloat(newRun.distance_km),
      })
      .select()
      .single()

    if (!error && data) {
      setRunLogs([data, ...runLogs])
      setNewRun({
        distance_km: '',
        duration_hours: '0',
        duration_minutes: '0',
        duration_seconds: '0',
      })
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('run_logs').delete().eq('id', id)
    setRunLogs(runLogs.filter(l => l.id !== id))
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
              {Math.floor(totalTime / 3600)}h {Math.floor((totalTime % 3600) / 60)}m
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

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Log a Run</CardTitle>
          <CardDescription>Add your virtual run activity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <Button onClick={handleAddRun}>
            <Plus className="mr-2 h-4 w-4" />
            Log Run
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Run History</CardTitle>
          <CardDescription>Your logged activities</CardDescription>
        </CardHeader>
        <CardContent>
          {runLogs.length > 0 ? (
            <div className="space-y-4">
              {runLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{log.distance_km} KM</p>
                      <p className="text-sm text-muted-foreground">
                        {Math.floor(log.duration_sec / 60)}m {log.duration_sec % 60}s
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
    <label htmlFor={htmlFor} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
      {children}
    </label>
  )
}