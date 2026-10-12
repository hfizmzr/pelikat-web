'use client'

import { CircleCheck, CircleStop, Flashlight, FlashlightOff, History, Info, QrCode, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

type ScanResult = {
  success: boolean
  alreadyCheckedIn?: boolean
  runner?: {
    name: string
    bib: string
    category?: string
    shirtSize?: string | null
  }
  message: string
}

type RecentScan = {
  bib: string
  name: string
  time: Date
  success: boolean
  alreadyCheckedIn?: boolean
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export default function OrganizerMobileScannerPage() {
  const [scanning, setScanning] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [torchOn, setTorchOn] = useState(false)
  const [processingBib, setProcessingBib] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [eventName, setEventName] = useState<string>('')
  const [scanCount, setScanCount] = useState(0)

  const qrRef = useRef<Html5Qrcode | null>(null)
  const scannerContainerId = 'pwa-qr-reader'
  const supabase = createClient()

  // Load the latest active event for context
  useEffect(() => {
    async function loadEvent() {
      const { data: { user } } = await supabase.auth.getUser()
      const orgId = user?.app_metadata?.organizer_id
      if (!orgId) return

      const { data } = await supabase
        .from('events')
        .select('id, name')
        .eq('organizer_id', orgId)
        .eq('status', 'active')
        .order('event_date', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (data) {
        setEventId(data.id)
        setEventName(data.name)
      } else {
        // Fallback: get most recent event
        const { data: recent } = await supabase
          .from('events')
          .select('id, name')
          .eq('organizer_id', orgId)
          .order('event_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (recent) {
          setEventId(recent.id)
          setEventName(recent.name)
        }
      }
    }
    loadEvent()
  }, [supabase])

  const processCheckIn = useCallback(
    async (bibOrNric: string) => {
      const cleaned = bibOrNric.trim().toUpperCase()
      if (!cleaned || processingBib === cleaned) return
      if (!eventId) {
        toast.error('No active event found')
        return
      }

      setProcessingBib(cleaned)
      setScanResult(null)

      try {
        const res = await fetch('/api/repc/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bibNumber: cleaned, eventId }),
        })
        const result = await res.json()

        const scanRes: ScanResult = {
          success: result.success,
          alreadyCheckedIn: result.alreadyCheckedIn,
          message: result.message,
          runner: result.bibNumber
            ? {
                name: result.runnerName || 'Unknown',
                bib: result.bibNumber,
                category: result.category,
                shirtSize: result.shirtSize,
              }
            : undefined,
        }

        setScanResult(scanRes)

        if (scanRes.success && !scanRes.alreadyCheckedIn) {
          vibrate([100, 50, 100])
          setScanCount((c) => c + 1)
        } else if (scanRes.alreadyCheckedIn) {
          vibrate([200])
        } else {
          vibrate([500])
        }

        setRecentScans((prev) => [
          {
            bib: cleaned,
            name: scanRes.runner?.name || cleaned,
            time: new Date(),
            success: scanRes.success,
            alreadyCheckedIn: scanRes.alreadyCheckedIn,
          },
          ...prev.slice(0, 9),
        ])
      } catch {
        setScanResult({ success: false, message: 'Network error. Please try again.' })
        vibrate([500])
      } finally {
        setProcessingBib(null)
      }
    },
    [eventId, processingBib]
  )

  const startScanning = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    setScanResult(null)

    try {
      qrRef.current = new Html5Qrcode(scannerContainerId)
      await qrRef.current.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 220, height: 120 } },
        async (decodedText) => {
          await processCheckIn(decodedText)
          // Brief pause before allowing next scan
          await new Promise((r) => setTimeout(r, 2000))
        },
        () => {}
      )
    } catch {
      setScanning(false)
      toast.error('Camera access denied. Please allow camera permissions.')
    }
  }, [scanning, processCheckIn])

  const stopScanning = useCallback(async () => {
    if (qrRef.current && scanning) {
      try {
        await qrRef.current.stop()
        qrRef.current.clear()
      } catch {}
    }
    setScanning(false)
    setTorchOn(false)
  }, [scanning])

  const toggleTorch = useCallback(async () => {
    if (!qrRef.current || !scanning) return
    try {
      const newState = !torchOn
      // @ts-expect-error - torch API is not in types
      await qrRef.current.applyVideoConstraints({ advanced: [{ torch: newState }] })
      setTorchOn(newState)
    } catch {}
  }, [scanning, torchOn])

  useEffect(() => {
    return () => {
      if (qrRef.current) {
        qrRef.current.stop().catch(() => {})
      }
    }
  }, [])

  const resultBg = scanResult
    ? scanResult.success && !scanResult.alreadyCheckedIn
      ? 'border-success/40 bg-success/5'
      : scanResult.alreadyCheckedIn
      ? 'border-primary/40 bg-primary/5'
      : 'border-red-300/40 bg-red-300/5'
    : 'border-border/40 bg-card'

  return (
    <div className="flex flex-col w-full bg-background min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[16px] font-bold text-foreground">BIB Pass</span>
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold tracking-wider uppercase">
                Scanner
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                {eventName || 'No active event'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Scan count badge */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/10">
              <span className="size-[14px] text-success"><CircleCheck className="size-[14px] text-success" /></span>
              <span className="text-[11px] font-bold text-success">{scanCount}</span>
            </div>
            {scanning && (
              <button
                onClick={toggleTorch}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  torchOn ? 'bg-primary/20 text-primary' : 'bg-accent text-muted-foreground'
                }`}
              >
                {torchOn ? (
                  <Flashlight className="size-[18px]" />
                ) : (
                  <FlashlightOff className="size-[18px]" />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-col px-4 py-4 space-y-4">
        {/* Scanner viewport */}
        <div className="relative w-full rounded-xl bg-background overflow-hidden shadow-xl border border-border/40">
          <div
            id={scannerContainerId}
            className="w-full"
            style={{ minHeight: scanning ? 220 : 0 }}
          />

          {!scanning && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="size-[32px] text-primary"><QrCode className="size-[32px] text-primary" /></span>
              </div>
              <p className="text-[12px] text-muted-foreground text-center">
                Tap the button below to activate camera scanner
              </p>
            </div>
          )}

          {/* Scanning overlay */}
          {scanning && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Scan line */}
              <div className="absolute left-[15%] right-[15%] top-1/2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_var(--primary)] animate-pulse" />
              {/* Corner markers */}
              {['top-4 left-4', 'top-4 right-4', 'bottom-4 left-4', 'bottom-4 right-4'].map((pos, i) => (
                <div
                  key={i}
                  className={`absolute ${pos} w-6 h-6 border-primary border-2 ${
                    i === 0 ? 'border-r-0 border-b-0 rounded-tl' :
                    i === 1 ? 'border-l-0 border-b-0 rounded-tr' :
                    i === 2 ? 'border-r-0 border-t-0 rounded-bl' :
                    'border-l-0 border-t-0 rounded-br'
                  }`}
                />
              ))}
              <div className="absolute bottom-2 inset-x-0 flex justify-center">
                <div className="bg-card/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span className="text-[10px] font-semibold text-foreground">SCANNING</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scanner toggle button */}
        <button
          onClick={scanning ? stopScanning : startScanning}
          className={`w-full py-3.5 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${
            scanning
              ? 'bg-red-800/80 text-red-300 border border-red-300/30'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {scanning ? (
            <CircleStop className="size-[18px]" />
          ) : (
            <QrCode className="size-[18px]" />
          )}
          {scanning ? 'Stop Scanner' : 'Start Camera Scanner'}
        </button>

        {/* Manual input */}
        <div className="flex items-center gap-2 bg-card rounded-xl p-2 border border-border/40">
          <div className="flex-1 bg-accent rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="size-[16px] text-muted-foreground"><Search className="size-[16px] text-muted-foreground" /></span>
            <input
              className="w-full bg-transparent text-foreground text-[13px] outline-none placeholder:text-muted-foreground"
              placeholder="NRIC, BIB or Order # …"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  processCheckIn(manualInput)
                  setManualInput('')
                }
              }}
            />
          </div>
          <button
            onClick={() => {
              processCheckIn(manualInput)
              setManualInput('')
            }}
            disabled={!manualInput.trim() || !!processingBib}
            className="bg-primary text-primary-foreground text-[12px] font-bold px-4 py-2.5 rounded-lg active:scale-95 transition-all disabled:opacity-40"
          >
            {processingBib ? '...' : 'Check In'}
          </button>
        </div>

        {/* Result card */}
        {scanResult && (
          <div className={`rounded-xl border p-4 transition-all ${resultBg}`}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  scanResult.success && !scanResult.alreadyCheckedIn
                    ? 'bg-success/20 text-success'
                    : scanResult.alreadyCheckedIn
                    ? 'bg-primary/20 text-primary'
                    : 'bg-red-300/20 text-red-300'
                }`}
              >
                {scanResult.success && !scanResult.alreadyCheckedIn ? (
                  <CircleCheck className="size-[20px]" />
                ) : scanResult.alreadyCheckedIn ? (
                  <Info className="size-[20px]" />
                ) : (
                  <X className="size-[20px]" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`text-[13px] font-bold ${
                    scanResult.success && !scanResult.alreadyCheckedIn
                      ? 'text-success'
                      : scanResult.alreadyCheckedIn
                      ? 'text-primary'
                      : 'text-red-300'
                  }`}
                >
                  {scanResult.success && !scanResult.alreadyCheckedIn
                    ? '✓ Checked In!'
                    : scanResult.alreadyCheckedIn
                    ? 'Already Checked In'
                    : '✗ Not Found'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{scanResult.message}</p>
              </div>
            </div>

            {scanResult.runner && (
              <div className="bg-background/60 rounded-lg p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[14px] font-bold shrink-0">
                  {scanResult.runner.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-foreground truncate">{scanResult.runner.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-mono bg-accent px-1.5 py-0.5 rounded text-muted-foreground">
                      {scanResult.runner.bib}
                    </span>
                    {scanResult.runner.shirtSize && (
                      <span className="text-[11px] text-muted-foreground">
                        Size: {scanResult.runner.shirtSize}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent scans */}
        {recentScans.length > 0 && (
          <div className="rounded-xl bg-card overflow-hidden border border-border/40">
            <div className="bg-success/10 text-success px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-[16px]"><History className="size-[16px]" /></span>
                <span className="text-[11px] font-bold tracking-wider uppercase">Recent Scans</span>
              </div>
              <span className="text-[10px] text-success/70">{recentScans.length} scanned</span>
            </div>
            <div className="divide-y divide-accent/40">
              {recentScans.map((scan, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      scan.success && !scan.alreadyCheckedIn
                        ? 'bg-success'
                        : scan.alreadyCheckedIn
                        ? 'bg-primary'
                        : 'bg-red-300'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{scan.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{scan.bib}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {scan.time.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
