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

type ScannerMode = 'checkin' | 'collector' | null

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

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export default function OrganizerCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: eventId } = use(params)
  
  const [scannerMode, setScannerMode] = useState<ScannerMode>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckIn[]>([])
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scanBusyRef = useRef(false)

  const [proxyBib, setProxyBib] = useState('')
  const [proxyCode, setProxyCode] = useState('')
  const [collectorQrPayload, setCollectorQrPayload] = useState('')
  const [proxyChecking, setProxyChecking] = useState(false)
  const scanning = scannerMode !== null

  const handleScan = useCallback(async (qrPayload: string) => {
    if (scanBusyRef.current) return

    scanBusyRef.current = true
    setScanResult(null)

    if (scannerMode === 'collector') {
      setCollectorQrPayload(qrPayload)
      setScanResult({
        success: true,
        message: 'Collector QR captured. Enter the absent runner BIB and consent code to complete proxy collection.',
      })
      vibrate(80)
      setScannerMode(null)
      window.setTimeout(() => {
        scanBusyRef.current = false
      }, 700)
      return
    }

    setCheckingIn(true)

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
        vibrate(result.alreadyCheckedIn ? [80, 60, 80] : 120)

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
        vibrate([80, 80, 80])
      }
    } catch {
      setScanResult({
        success: false,
        message: 'Error verifying QR code',
      })
      vibrate([80, 80, 80])
    } finally {
      setCheckingIn(false)
      window.setTimeout(() => {
        scanBusyRef.current = false
      }, 1200)
    }
  }, [eventId, scannerMode])

  useEffect(() => {
    let cancelled = false

    if (scannerMode) {
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
  }, [handleScan, scannerMode])

  const toggleScanning = (mode: Exclude<ScannerMode, null>) => {
    if (scannerMode === mode) {
      setScannerMode(null)
      return
    }

    setCameraError(null)
    setScannerMode(mode)
  }

  const handleManualSearch = async () => {
    if (!searchQuery) return

    setCheckingIn(true)
    setScanResult(null)

    try {
      const result = resultFromRpc(await checkInRegistrationByBib(eventId, searchQuery))
      setScanResult(result)
      vibrate(result.success ? 120 : [80, 80, 80])

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
      vibrate([80, 80, 80])
    } finally {
      setCheckingIn(false)
    }
  }

  const handleProxyCheckIn = async () => {
    if (!proxyBib || !proxyCode || !collectorQrPayload) return

    setProxyChecking(true)
    setScanResult(null)

    try {
      const response = await fetch('/api/repc/proxy-check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          absent_bib_number: proxyBib.trim(),
          consent_code: proxyCode.trim().toUpperCase(),
          collector_qr_payload: collectorQrPayload,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const result: ScanResult = {
          success: true,
          message: data.collector?.name
            ? `${data.message || 'Proxy check-in successful'} - collected by ${data.collector.name} (BIB #${data.collector.bib})`
            : data.message || 'Proxy check-in successful',
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
        vibrate(result.alreadyCheckedIn ? [80, 60, 80] : 120)

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

        setProxyBib('')
        setProxyCode('')
        setCollectorQrPayload('')
      } else {
        setScanResult({
          success: false,
          message: data.message || 'Proxy check-in failed',
        })
        vibrate([80, 80, 80])
      }
    } catch {
      setScanResult({ success: false, message: 'Could not complete proxy check-in' })
      vibrate([80, 80, 80])
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
              {scannerMode === 'collector' ? 'Collector QR Scanner' : 'QR Scanner'}
            </CardTitle>
            <CardDescription>
              {scannerMode === 'collector'
                ? "Scan the collector's own Digital BIB QR before proxy collection"
                : 'Scan runner QR codes for quick check-in'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => toggleScanning('checkin')}
              className="w-full"
              variant={scannerMode === 'checkin' ? 'destructive' : 'default'}
              disabled={checkingIn}
            >
              {scannerMode === 'checkin' ? 'Stop Runner Scanner' : 'Start Runner Scanner'}
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
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Collector QR</p>
                  <p className="text-xs text-muted-foreground">
                    {collectorQrPayload
                      ? 'Collector QR captured and ready for server validation.'
                      : "Scan the collector's own Digital BIB QR first."}
                  </p>
                </div>
                <Badge variant={collectorQrPayload ? 'default' : 'secondary'}>
                  {collectorQrPayload ? 'Captured' : 'Required'}
                </Badge>
              </div>
              <Button
                type="button"
                variant={scannerMode === 'collector' ? 'destructive' : 'outline'}
                className="mt-3 w-full"
                onClick={() => toggleScanning('collector')}
              >
                <QrCode className="mr-2 h-4 w-4" />
                {scannerMode === 'collector' ? 'Stop Collector Scanner' : 'Scan Collector QR'}
              </Button>
            </div>
            <div className="space-y-2">
              <Input
                placeholder="Absent runner BIB number"
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
              disabled={proxyChecking || !proxyBib || !proxyCode || !collectorQrPayload}
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
