'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, ShieldCheck } from 'lucide-react'

// ── DuitNow QR panel ────────────────────────────────────────────
// Renders the raw DuitNow QR payload IN-APP as a scannable SVG
// (qrcode lib, already a dependency — no new deps added). The QR
// sits on an explicit white tile: QR scanners need light/dark
// contrast, so this tile intentionally does not follow dark mode.
// If QR generation fails or the provider returns no payload, we
// fall back to the hosted checkout URL.

interface DuitNowQrPanelProps {
  /** Raw EMVCo/DuitNow QR payload string from the payment service. */
  payload: string
  amount: number
  eventName: string
  /** Hosted checkout URL used only as a fallback link. */
  fallbackUrl?: string | null
  /** Runner signals "money sent" → move to awaiting confirmation. */
  onPaid: () => void
}

export default function DuitNowQrPanel({ payload, amount, eventName, fallbackUrl, onPaid }: DuitNowQrPanelProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    QRCode.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 480 })
      .then((markup) => {
        if (!cancelled) setSvg(markup)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [payload])

  return (
    <section className="bg-card rounded-2xl border border-border/60 p-5 flex flex-col items-center text-center gap-4">
      <div
        role="img"
        aria-label="DuitNow QR code — scan with your banking app"
        data-testid="duitnow-qr"
        data-qr-payload={payload}
        className="w-[240px] h-[240px] bg-white rounded-xl p-3 flex items-center justify-center"
      >
        {svg ? (
          <div
            className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : failed ? (
          fallbackUrl ? (
            <a
              href={fallbackUrl}
              className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold"
            >
              Open secure checkout
            </a>
          ) : (
            <QrCode className="size-[40px] text-muted-foreground" aria-hidden="true" />
          )
        ) : (
          <div className="w-full h-full rounded bg-muted/40 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
        )}
      </div>

      <div className="flex flex-col">
        <p className="text-[24px] font-bold text-primary leading-none">RM {amount}</p>
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-full truncate">{eventName}</p>
      </div>

      <div className="flex flex-col">
        <h3 className="text-[14px] font-bold text-foreground">Scan with your banking app</h3>
        <p className="text-[12px] text-muted-foreground mt-1">
          Open Touch &apos;n Go eWallet, MAE, Boost or any DuitNow-enabled app and scan this code. Payment is
          confirmed here automatically.
        </p>
      </div>

      <button
        type="button"
        onClick={onPaid}
        className="w-full inline-flex items-center justify-center min-h-[44px] py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold active:scale-95 transition-transform"
      >
        I&apos;ve paid — check status
      </button>

      <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
        <ShieldCheck className="size-[14px]" aria-hidden="true" />
        Payment confirmed automatically via HitPay · DuitNow
      </p>
    </section>
  )
}
