'use client'

import { CircleCheck, CircleStop, Flashlight, FlashlightOff, History, Info, QrCode, Search, X } from "lucide-react"
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { checkInRegistrationByBib } from '@/components/events/actions'
import type { MerchHandover, RepcCheckInResult } from '@/lib/repc'
import { MerchHandoverNote } from '@/components/repc/merch-handover-note'
import { RACE_CONSOLE_STATUSES, malaysiaToday } from '@/lib/event-dates'

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
  // Orders to hand over now: the check-in already marked them collected.
  merch?: MerchHandover | null
}

type RecentScan = {
  bib: string
  name: string
  time: Date
  success: boolean
  alreadyCheckedIn?: boolean
}

/** /api/repc/check-in response (snake_case), same contract the desktop
 * check-in page uses. */
type CheckInApiResponse = {
  success?: boolean
  message?: string
  already_checked_in?: boolean
  runner?: { name?: string; bib?: string; shirt_size?: string | null } | null
  merch?: MerchHandover | null
}

function resultFromApi(data: CheckInApiResponse): ScanResult {
  return {
    success: !!data.success,
    message: data.message || (data.success ? 'Checked in' : 'Invalid QR code'),
    alreadyCheckedIn: !!data.already_checked_in,
    runner: data.success && data.runner?.bib
      ? { name: data.runner.name || 'Unknown', bib: data.runner.bib, shirtSize: data.runner.shirt_size ?? null }
      : undefined,
    merch: data.merch ?? null,
  }
}

function resultFromRpc(result: RepcCheckInResult): ScanResult {
  return {
    success: result.success,
    message: result.message,
    alreadyCheckedIn: result.alreadyCheckedIn,
    runner: result.success && result.bibNumber
      ? { name: result.runnerName || 'Unknown', bib: result.bibNumber, shirtSize: result.shirtSize }
      : undefined,
    merch: result.merch ?? null,
  }
}

/** Same pass seen again within this window is ignored (it is still in view). */
const QR_REPEAT_COOLDOWN_MS = 4000

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export default function OrganizerMobileScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // ?event=<id> from the console, home and events list: scan into exactly
  // the race the organizer was looking at.
  const requestedEvent = use(searchParams).event
  const requestedEventId = typeof requestedEvent === 'string' ? requestedEvent : null
  const [scanning, setScanning] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [torchOn, setTorchOn] = useState(false)
  const [processingBib, setProcessingBib] = useState<string | null>(null)
  // The event is stored with the request it was loaded for. Until the lookup
  // for the *current* ?event= resolves, there is no event to check in to, so
  // a scan can never land in the race the scanner showed a moment ago.
  const [loadedEvent, setLoadedEvent] = useState<{
    request: string | null
    status: 'ok' | 'none' | 'error'
    id: string | null
    name: string
  } | null>(null)
  const currentEvent = loadedEvent && loadedEvent.request === requestedEventId ? loadedEvent : null
  const eventId = currentEvent?.status === 'ok' ? currentEvent.id : null
  const eventName = currentEvent?.name ?? ''
  const eventStatus = currentEvent?.status ?? 'loading'
  const [scanCount, setScanCount] = useState(0)

  const qrRef = useRef<Html5Qrcode | null>(null)
  const busyRef = useRef(false)
  const lastQrRef = useRef<{ text: string; at: number } | null>(null)
  const scannerContainerId = 'pwa-qr-reader'
  const supabase = createClient()

  // Which race to check runners into: the one the link asked for (if it is
  // this organizer's), else the same "next race" rule as the race console.
  // The old lookup filtered on an 'active' status the schema does not have,
  // so it always fell back to the organizer's furthest-future event.
  useEffect(() => {
    let cancelled = false
    async function loadEvent() {
      const settle = (status: 'ok' | 'none' | 'error', event?: { id: string; name: string } | null) => {
        if (cancelled) return
        setLoadedEvent({ request: requestedEventId, status, id: event?.id ?? null, name: event?.name ?? '' })
      }

      const { data: { user } } = await supabase.auth.getUser()
      const orgId = user?.app_metadata?.organizer_id
      if (!orgId) return settle('none')

      if (requestedEventId) {
        const { data, error } = await supabase
          .from('events')
          .select('id, name')
          .eq('organizer_id', orgId)
          .eq('id', requestedEventId)
          .maybeSingle()
        // A failed lookup must not quietly switch to another race: stop and
        // say so. Only "no such event for this organizer" falls back below.
        if (error) return settle('error')
        if (data) return settle('ok', data)
      }

      const { data, error } = await supabase
        .from('events')
        .select('id, name')
        .eq('organizer_id', orgId)
        .in('status', [...RACE_CONSOLE_STATUSES])
        .gte('event_date', malaysiaToday())
        .order('event_date', { ascending: true })
        .order('id', { ascending: true }) // same tie-breaker as console and home
        .limit(1)
        .maybeSingle()
      if (error) return settle('error')
      settle(data ? 'ok' : 'none', data)
    }
    loadEvent()
    return () => {
      cancelled = true
    }
  }, [supabase, requestedEventId])

  // Camera scans carry the runner's signed QR payload: verified server-side
  // through /api/repc/check-in (never uppercased, it is a token). Typed input
  // is a bib number: checked in by bib, exactly like the desktop page.
  const processCheckIn = useCallback(
    async (input: string, source: 'qr' | 'bib') => {
      const cleaned = input.trim()
      // A ref, not state: the camera fires for every decoded frame and a
      // state check would read a stale value, letting duplicates through.
      if (!cleaned || busyRef.current) return
      if (!eventId) {
        toast.error(
          eventStatus === 'loading'
            ? 'Still loading the event. Try again in a moment.'
            : eventStatus === 'error'
            ? "Couldn't load the event. Check the connection and reopen the scanner."
            : 'No upcoming event to check in to'
        )
        return
      }

      busyRef.current = true
      setProcessingBib(cleaned)
      setScanResult(null)

      try {
        let scanRes: ScanResult
        if (source === 'qr') {
          const res = await fetch('/api/repc/check-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_payload: cleaned, event_id: eventId }),
          })
          scanRes = resultFromApi(await res.json())
        } else {
          scanRes = resultFromRpc(await checkInRegistrationByBib(eventId, cleaned))
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

        // A QR payload is a long token: show the runner's bib, never the
        // token. A failed scan shows why it failed instead of a name.
        setRecentScans((prev) => [
          {
            bib: scanRes.runner?.bib || (source === 'bib' ? cleaned.toUpperCase() : '—'),
            name: scanRes.runner?.name || scanRes.message,
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
        busyRef.current = false
        setProcessingBib(null)
      }
    },
    [eventId, eventStatus]
  )

  // The camera callback is registered once, when the camera starts: route it
  // through a ref so it always uses the latest handler (and the event that
  // finished loading after Start was tapped).
  const processRef = useRef(processCheckIn)
  useEffect(() => {
    processRef.current = processCheckIn
  }, [processCheckIn])

  // A pass held up to the camera decodes on every frame: handle it once, then
  // ignore the same QR for a few seconds so it is not checked in repeatedly.
  const onQrDecoded = useCallback(async (decodedText: string) => {
    const last = lastQrRef.current
    if (busyRef.current) return
    if (last && last.text === decodedText && Date.now() - last.at < QR_REPEAT_COOLDOWN_MS) return
    lastQrRef.current = { text: decodedText, at: Date.now() }
    await processRef.current(decodedText, 'qr')
    lastQrRef.current = { text: decodedText, at: Date.now() }
  }, [])

  const startScanning = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    setScanResult(null)

    try {
      qrRef.current = new Html5Qrcode(scannerContainerId)
      await qrRef.current.start(
        { facingMode: 'environment' },
        // Runner passes are square QR codes: a square scan box sized to the
        // viewfinder. The old 220x120 strip (a 1D-barcode shape) cut the QR
        // off top and bottom, so it only decoded with the pass held far away.
        {
          fps: 15,
          qrbox: (w: number, h: number) => {
            const size = Math.max(120, Math.floor(Math.min(w, h) * 0.75))
            return { width: size, height: size }
          },
        },
        (decodedText) => {
          void onQrDecoded(decodedText)
        },
        () => {}
      )
    } catch {
      setScanning(false)
      toast.error('Camera access denied. Please allow camera permissions.')
    }
  }, [scanning, onQrDecoded])

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
      : 'border-destructive dark:border-destructive/40 bg-destructive/10 dark:bg-destructive/5'
    : 'border-border/40 bg-card'

  return (
    <div className="flex flex-col w-full bg-background min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/40 px-5 pt-safe">
        <div className="h-14 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[16px] font-medium text-foreground">Scanner</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                {eventStatus === 'loading'
                  ? 'Loading event…'
                  : eventStatus === 'error'
                  ? "Couldn't load the event"
                  : eventName || 'No upcoming event'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Scan count badge */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/10">
              <CircleCheck className="size-[14px] text-success" />
              <span className="text-[11px] font-medium text-success">{scanCount}</span>
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
        <div className="relative w-full rounded-xl bg-background overflow-hidden shadow-lg border border-border/40">
          <div
            id={scannerContainerId}
            className="w-full"
            style={{ minHeight: scanning ? 220 : 0 }}
          />

          {!scanning && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <QrCode className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-[13px] text-muted-foreground text-center">
                Start the camera to scan a runner&apos;s QR pass
              </p>
            </div>
          )}

          {/* Scanning overlay */}
          {scanning && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Scan line */}
              <div className="absolute left-[15%] right-[15%] top-1/2 h-0.5 bg-primary/80" />
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
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-[11px] font-medium text-foreground">SCANNING</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scanner toggle button */}
        <button
          onClick={scanning ? stopScanning : startScanning}
          className={`w-full py-3.5 rounded-xl font-medium text-[14px] flex items-center justify-center gap-2 transition-[color,background-color,border-color,opacity,transform] active:scale-[0.98] shadow-md ${
            scanning
              ? 'bg-destructive text-white dark:text-background'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {scanning ? (
            <CircleStop className="size-[18px]" />
          ) : (
            <QrCode className="size-[18px]" />
          )}
          {scanning ? 'Stop scanner' : 'Start camera scanner'}
        </button>

        {/* Manual input */}
        <div className="flex items-center gap-2 bg-card rounded-xl p-2 border border-border/40">
          <div className="flex-1 bg-accent rounded-lg px-3 py-2 flex items-center gap-2">
            <Search className="size-[16px] text-muted-foreground" />
            <input
              className="w-full bg-transparent text-foreground text-[13px] outline-none placeholder:text-muted-foreground"
              placeholder="Bib number"
              aria-label="Bib number"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  processCheckIn(manualInput, 'bib')
                  setManualInput('')
                }
              }}
            />
          </div>
          <button
            onClick={() => {
              processCheckIn(manualInput, 'bib')
              setManualInput('')
            }}
            disabled={!manualInput.trim() || !!processingBib}
            className="bg-primary text-primary-foreground text-[12px] font-medium px-4 py-2.5 rounded-lg active:scale-[0.98] transition-[color,background-color,border-color,opacity,transform] disabled:opacity-40"
          >
            {processingBib ? '...' : 'Check in'}
          </button>
        </div>

        {/* Result card */}
        {scanResult && (
          <div className={`rounded-xl border p-4 transition-[color,background-color,border-color,opacity] ${resultBg}`}>
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  scanResult.success && !scanResult.alreadyCheckedIn
                    ? 'bg-success/20 text-success'
                    : scanResult.alreadyCheckedIn
                    ? 'bg-primary/20 text-primary'
                    : 'bg-destructive/10 dark:bg-destructive/20 text-destructive'
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
                  className={`text-[13px] font-medium ${
                    scanResult.success && !scanResult.alreadyCheckedIn
                      ? 'text-success'
                      : scanResult.alreadyCheckedIn
                      ? 'text-primary'
                      : 'text-destructive'
                  }`}
                >
                  {scanResult.success && !scanResult.alreadyCheckedIn
                    ? 'Checked in'
                    : scanResult.alreadyCheckedIn
                    ? 'Already checked in'
                    : 'Not checked in'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{scanResult.message}</p>
              </div>
            </div>

            {scanResult.runner && (
              <div className="bg-background/60 rounded-lg p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[14px] font-medium shrink-0">
                  {scanResult.runner.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{scanResult.runner.name}</p>
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

            {/* The check-in already marked these orders collected: staff must
                see them to actually hand them over. */}
            {scanResult.merch && (
              <MerchHandoverNote
                merch={scanResult.merch}
                className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-3 text-[13px] text-foreground"
              />
            )}
          </div>
        )}

        {/* Recent scans */}
        {recentScans.length > 0 && (
          <div className="rounded-xl bg-card overflow-hidden border border-border/40">
            <div className="bg-success/10 text-success px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="size-[16px]" />
                <span className="text-[11px] font-medium">Recent scans</span>
              </div>
              <span className="text-[11px] text-success/70">{recentScans.length} scanned</span>
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
                        : 'bg-destructive'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{scan.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{scan.bib}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
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
