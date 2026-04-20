'use client'

import { useEffect, useState, useRef, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { QrCode, Search, CheckCircle, XCircle } from 'lucide-react'

export default function OrganizerCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: eventId } = use(params)
  
  const [scanning, setScanning] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [scanResult, setScanResult] = useState<{
    success: boolean
    message: string
    runner?: { name: string; bib: string }
  } | null>(null)
  const [recentCheckins, setRecentCheckins] = useState<{ name: string; bib: string; time: Date }[]>([])
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (scanning && !scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      )

      scannerRef.current.render(
        async (decodedText) => {
          await handleScan(decodedText)
        },
        (error) => {
          console.log('Scan error:', error)
        }
      )
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear()
        scannerRef.current = null
      }
    }
  }, [scanning])

  const handleScan = async (qrPayload: string) => {
    setScanResult(null)

    try {
      const response = await fetch('/api/qr/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_payload: qrPayload, event_id: eventId }),
      })

      const data = await response.json()

      if (data.valid) {
        await supabase
          .from('registrations')
          .update({ checked_in: true, checked_in_at: new Date().toISOString() })
          .eq('id', data.registration_id)

        setScanResult({
          success: true,
          message: 'Check-in successful!',
          runner: data.runner,
        })

        setRecentCheckins((prev) => [
          { name: data.runner.name, bib: data.runner.bib, time: new Date() },
          ...prev.slice(0, 4),
        ])
      } else {
        setScanResult({
          success: false,
          message: data.message || 'Invalid QR code',
        })
      }
    } catch (error) {
      setScanResult({
        success: false,
        message: 'Error verifying QR code',
      })
    }
  }

  const handleManualSearch = async () => {
    if (!searchQuery) return

    const { data: registration } = await supabase
      .from('registrations')
      .select('id, bib_number, checked_in, runner_profiles(full_name)')
      .eq('event_id', eventId)
      .eq('bib_number', searchQuery)
      .single()

    if (registration) {
      const runnerProfiles = registration.runner_profiles as { full_name?: string } | null | undefined
      const runnerName = Array.isArray(runnerProfiles) 
        ? runnerProfiles[0]?.full_name 
        : runnerProfiles?.full_name

      await supabase
        .from('registrations')
        .update({ checked_in: true, checked_in_at: new Date().toISOString() })
        .eq('id', registration.id)

      setScanResult({
        success: true,
        message: 'Check-in successful!',
        runner: {
          name: runnerName || 'Unknown',
          bib: registration.bib_number,
        },
      })

      setRecentCheckins((prev) => [
        {
          name: runnerName || 'Unknown',
          bib: registration.bib_number,
          time: new Date(),
        },
        ...prev.slice(0, 4),
      ])
    } else {
      setScanResult({
        success: false,
        message: 'Registration not found',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Check-in Dashboard</h1>
        <p className="text-muted-foreground">Scan QR codes to check in runners</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Scanner
            </CardTitle>
            <CardDescription>Scan runner QR codes for quick check-in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => setScanning(!scanning)}
              className="w-full"
              variant={scanning ? 'destructive' : 'default'}
            >
              {scanning ? 'Stop Scanning' : 'Start Scanning'}
            </Button>

            {scanning && <div id="qr-reader" className="w-full" />}

            {scanResult && (
              <div
                className={`flex items-center gap-3 rounded-lg p-4 ${
                  scanResult.success
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                }`}
              >
                {scanResult.success ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <div>
                  <p className="font-medium">{scanResult.message}</p>
                  {scanResult.runner && (
                    <p className="text-sm">
                      {scanResult.runner.name} - BIB #{scanResult.runner.bib}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle>Manual Search</CardTitle>
            <CardDescription>Search by BIB number</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter BIB number"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              />
              <Button onClick={handleManualSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Check-ins</CardTitle>
            <CardDescription>Latest check-ins for this event</CardDescription>
          </CardHeader>
          <CardContent>
            {recentCheckins.length > 0 ? (
              <div className="space-y-2">
                {recentCheckins.map((checkin, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-secondary p-3"
                  >
                    <div>
                      <p className="font-medium">{checkin.name}</p>
                      <p className="text-sm text-muted-foreground">BIB #{checkin.bib}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="default">Checked In</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {checkin.time.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No check-ins yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}