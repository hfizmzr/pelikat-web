'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Activity, RefreshCw } from 'lucide-react'

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  message: string
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: Record<string, HealthCheck>
}

export function HealthMonitor() {
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<HealthResponse | null>(null)

  const fetchHealth = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/health')
    if (res.ok) {
      const data = await res.json()
      setHealth(data)
    }
    setLoading(false)
  }

   
  useEffect(() => {
    const controller = new AbortController()
    fetchHealth()
    return () => controller.abort()
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500">Healthy</Badge>
      case 'degraded':
        return <Badge className="bg-amber-500">Degraded</Badge>
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </CardTitle>
          <CardDescription>Checking system status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchHealth}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
        <CardDescription>
          Overall status:{' '}
          {health ? getStatusBadge(health.status) : 'Unknown'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {health && Object.entries(health.checks).length > 0 ? (
          <div className="space-y-3">
            {Object.entries(health.checks).map(([service, check]) => (
              <div
                key={service}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium capitalize">{service}</p>
                  <p className="text-sm text-muted-foreground">{check.message}</p>
                </div>
                {getStatusBadge(check.status)}
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to fetch health status</p>
        )}
      </CardContent>
    </Card>
  )
}
