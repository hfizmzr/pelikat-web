'use client'

import { useCallback, useEffect, useState, useRef, use } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Html5Qrcode } from 'html5-qrcode'
import { QrCode, Search, CheckCircle, XCircle, Users } from 'lucide-react'
import { checkInRegistrationByBib } from '@/components/events/actions'
import type { RepcCheckInResult } from '@/lib/repc'
import { createClient } from '@/lib/supabase/client'

type ScanResult = {
  success: boolean
  message: string
  alreadyCheckedIn?: boolean
  runner?: {
    name: string
    bib: string
    shirtSize?: string | null
    remainingQty?: number | null
  }
}

type RecentCheckIn = {
  name: string
  bib: string
  shirtSize?: string | null
  time: Date
  alreadyCheckedIn?: boolean
}

function resultFromRpc(result: RepcCheckInResult): ScanResult {
  return {
    success: result.success,
    message: result.message,
    alreadyCheckedIn: result.alreadyCheckedIn,
    runner: result.bibNumber
      ? {
          name: result.runnerName || 'Unknown',
          bib: result.bibNumber,
          shirtSize: result.shirtSize,
          remainingQty: result.remainingQty,
        }
      : undefined,
  }
}

export default function OrganizerCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: eventId } = use(params)
  
  const [scanning, setScanning] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckIn[]>([])
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scanBusyRef = useRef(false)

  const [proxyBib, setProxyBib] = useState('')
  const [proxyCode, setProxyCode] = useState('')
  const [proxyChecking, setProxyChecking] = useState(false)

  const handleScan = useCallback(async (qrPayload: string) => {
    if (scanBusyRef.current) return

    scanBusyRef.current = true
    setCheckingIn(true)
    setScanResult(null)

    try {
      const response = await fetch('/api/repc/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_payload: qrPayload, event_id: eventId }),
      })

      const data = await response.json()

      if (data.success) {
        const result: ScanResult = {
          success: true,
          message: data.message || 'Check-in successful!',
          alreadyCheckedIn: data.already_checked_in,
          runner: data.runner
            ? {
                name: data.runner.name || 'Unknown',
                bib: data.runner.bib || '',
                shirtSize: data.runner.shirt_size ?? null,
                remainingQty: data.runner.remaining_qty ?? null,
              }
            : undefined,
        }

        setScanResult(result)

        if (result.runner) {
          setRecentCheckins((prev) => [
            {
              name: result.runner?.name || 'Unknown',
              bib: result.runner?.bib || '',
              shirtSize: result.runner?.shirtSize,
              time: new Date(),
              alreadyCheckedIn: result.alreadyCheckedIn,
            },
            ...prev.slice(0, 4),
          ])
        }
      } else {
        setScanResult({
          success: false,
          message: data.message || 'Invalid QR code',
        })
      }
    } catch {
      setScanResult({
        success: false,
        message: 'Error verifying QR code',
      })
    } finally {
      setCheckingIn(false)
      window.setTimeout(() => {
        scanBusyRef.current = false
      }, 1200)
    }
  }, [eventId])

  useEffect(() => {
    let cancelled = false

    if (scanning) {
      if (!scannerRef.current) {
        const scanner = new Html5Qrcode('qr-reader')
        scannerRef.current = scanner

        scanner
          .start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            async (decodedText) => {
              if (!cancelled) await handleScan(decodedText)
            },
            () => {}
          )
          .catch(() => {
            if (!cancelled) setCameraError('Could not start camera. Check permissions or switch to Manual Search.')
          })
      }
    }

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      scannerRef.current = null
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => {})
      }
    }
  }, [handleScan, scanning])

  const toggleScanning = () => {
    if (scanning) {
      setScanning(false)
      return
    }

    setCameraError(null)
    setScanning(true)
  }

  const handleManualSearch = async () => {
    if (!searchQuery) return

    setCheckingIn(true)
    setScanResult(null)

    try {
      const result = resultFromRpc(await checkInRegistrationByBib(eventId, searchQuery))
      setScanResult(result)

      if (result.success && result.runner) {
        setRecentCheckins((prev) => [
          {
            name: result.runner?.name || 'Unknown',
            bib: result.runner?.bib || '',
            shirtSize: result.runner?.shirtSize,
            time: new Date(),
            alreadyCheckedIn: result.alreadyCheckedIn,
          },
          ...prev.slice(0, 4),
        ])
      }
    } catch {
      setScanResult({ success: false, message: 'Could not check in this runner' })
    } finally {
      setCheckingIn(false)
    }
  }

  const handleProxyCheckIn = async () => {
    if (!proxyBib || !proxyCode) return

    setProxyChecking(true)
    setScanResult(null)

    try {
      const supabase = createClient()

      const { data: registration } = await supabase
        .from('registrations')
        .select('runner_id, bib_number')
        .eq('event_id', eventId)
        .eq('bib_number', proxyBib.trim())
        .maybeSingle()

      if (!registration) {
        setScanResult({ success: false, message: 'Registration not found' })
        return
      }

      const { data: userData } = await supabase.auth.getUser()

      const { data, error } = await supabase.rpc('repc_check_in_registration', {
        p_event_id: eventId,
        p_runner_id: registration.runner_id,
        p_bib_number: registration.bib_number,
        p_is_proxy: true,
        p_consent_code: proxyCode.trim().toUpperCase(),
        p_collected_by: userData.user?.email ?? userData.user?.id ?? null,
      })

      if (error) {
        setScanResult({ success: false, message: error.message })
        return
      }

      const row = data?.[0] ?? null
      const sl = row?.success ?? false
      if (sl) {
        setScanResult({
          success: true,
          message: row?.message || 'Proxy check-in successful',
          alreadyCheckedIn: row?.already_checked_in ?? false,
          runner: {
            name: row?.runner_name || 'Unknown',
            bib: row?.bib_number || '',
            shirtSize: row?.shirt_size,
            remainingQty: row?.remaining_qty ?? null,
          },
        })

        setRecentCheckins((prev) => [
          {
            name: row?.runner_name || 'Unknown',
            bib: row?.bib_number || '',
            shirtSize: row?.shirt_size,
            time: new Date(),
            alreadyCheckedIn: row?.already_checked_in ?? false,
          },
          ...prev.slice(0, 4),
        ])

        setProxyBib('')
        setProxyCode('')
      } else {
        setScanResult({
          success: false,
          message: row?.message || 'Proxy check-in failed',
        })
      }
    } catch {
      setScanResult({ success: false, message: 'Could not complete proxy check-in' })
    } finally {
      setProxyChecking(false)
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
              onClick={toggleScanning}
              className="w-full"
              variant={scanning ? 'destructive' : 'default'}
              disabled={checkingIn}
            >
              {scanning ? 'Stop Scanning' : 'Start Scanning'}
            </Button>

            {cameraError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {checkingIn && (
              <p className="text-sm text-muted-foreground">Checking registration and shirt stock...</p>
            )}

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
                    <div className="text-sm">
                      <p>
                        {scanResult.runner.name} - BIB #{scanResult.runner.bib}
                      </p>
                      {scanResult.runner.shirtSize && (
                        <p>
                          Shirt {scanResult.runner.shirtSize}
                          {typeof scanResult.runner.remainingQty === 'number'
                            ? `, ${scanResult.runner.remainingQty} remaining`
                            : ''}
                        </p>
                      )}
                    </div>
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

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Proxy Collection
            </CardTitle>
            <CardDescription>Check in using a consent code for someone else</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="Enter BIB number"
                value={proxyBib}
                onChange={(e) => setProxyBib(e.target.value)}
              />
              <Input
                placeholder="Enter consent code"
                value={proxyCode}
                onChange={(e) => setProxyCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleProxyCheckIn()}
                className="font-mono tracking-widest text-center text-lg"
                maxLength={6}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleProxyCheckIn}
              disabled={proxyChecking || !proxyBib || !proxyCode}
            >
              {proxyChecking ? 'Checking...' : 'Check In (Proxy)'}
            </Button>
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
                      <p className="text-sm text-muted-foreground">
                        BIB #{checkin.bib}
                        {checkin.shirtSize ? ` | Shirt ${checkin.shirtSize}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={checkin.alreadyCheckedIn ? 'secondary' : 'default'}>
                        {checkin.alreadyCheckedIn ? 'Already In' : 'Checked In'}
                      </Badge>
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
