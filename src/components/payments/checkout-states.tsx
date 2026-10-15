'use client'

import { CircleAlert, CircleCheck, Hourglass, LoaderCircle, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

// ── Checkout state cards ────────────────────────────────────────
// One visual shell for every payment state so switching between
// creating → qr → awaiting → confirmed/failed never shifts layout.
// Mobile-first: every interactive element is ≥44px tall.

function StateCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`bg-card rounded-2xl border border-border/60 p-5 flex flex-col items-center text-center gap-3 ${className}`}
    >
      {children}
    </section>
  )
}

/** Provider session is being created. Spinner only — no layout shift. */
export function CreatingState() {
  return (
    <StateCard className="min-h-[168px] justify-center">
      <LoaderCircle className="size-[32px] text-primary animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <div>
        <h3 className="text-[15px] font-bold text-foreground">Preparing your payment…</h3>
        <p className="text-[12px] text-muted-foreground mt-1">Setting up a secure DuitNow session.</p>
      </div>
    </StateCard>
  )
}

/** Handing off to the HitPay hosted checkout (FPX / e-wallet). */
export function RedirectingState({ checkoutUrl }: { checkoutUrl?: string | null }) {
  return (
    <StateCard className="min-h-[168px] justify-center">
      <LoaderCircle className="size-[32px] text-primary animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <div>
        <h3 className="text-[15px] font-bold text-foreground">Redirecting to secure checkout…</h3>
        <p className="text-[12px] text-muted-foreground mt-1">
          FPX online banking and e-wallets open in HitPay&apos;s secure window. You&apos;ll come back here
          automatically.
        </p>
      </div>
      {checkoutUrl && (
        <a
          href={checkoutUrl}
          className="mt-1 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-accent text-accent-foreground text-[13px] font-bold"
        >
          Not redirected? Tap here
        </a>
      )}
    </StateCard>
  )
}

/** Back from hosted checkout / QR scanned — confirmation is pending. */
export function AwaitingState() {
  return (
    <StateCard className="min-h-[168px] justify-center">
      <div className="relative size-[40px] flex items-center justify-center" aria-hidden="true">
        <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping motion-reduce:animate-none" />
        <LoaderCircle className="size-[24px] text-primary animate-spin motion-reduce:animate-none" />
      </div>
      <div>
        <h3 className="text-[15px] font-bold text-foreground">Confirming your payment…</h3>
        <p className="text-[12px] text-muted-foreground mt-1">
          Keep this page open — we&apos;re checking with your bank. This usually takes a few seconds.
        </p>
      </div>
    </StateCard>
  )
}

/** Payment confirmed. BIB comes from the registration row, never the URL.
 *  Virtual events have no physical BIB: the primary CTA returns to the
 *  event page instead of the BIB view. */
export function ConfirmedState({
  bibNumber,
  eventId,
  eventType,
}: {
  bibNumber: string | null
  eventId: string
  eventType?: string | null
}) {
  const isVirtual = eventType === 'virtual'
  return (
    <div className="bg-success/10 border border-success/30 p-5 rounded-2xl flex flex-col items-center text-center gap-3">
      <CircleCheck className="size-[40px] text-success" aria-hidden="true" />
      <div>
        <h3 className="text-[16px] font-bold text-success mb-1">Payment Successful!</h3>
        <p className="text-[13px] text-success/80">Your registration is confirmed. See you at the start line.</p>
      </div>
      {bibNumber && !isVirtual && (
        <div className="w-full bg-card/60 rounded-xl border border-success/20 px-4 py-3 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your BIB</span>
          <span className="font-mono text-[18px] font-bold text-foreground">{bibNumber}</span>
        </div>
      )}
      {isVirtual ? (
        <Link
          href={`/runner/events/${eventId}`}
          className="w-full inline-flex items-center justify-center min-h-[44px] py-3 rounded-xl bg-success text-emerald-900 text-[13px] font-bold active:scale-95 transition-transform"
        >
          Back to Event
        </Link>
      ) : (
        <>
          <Link
            href={`/runner/events/${eventId}/bib`}
            className="w-full inline-flex items-center justify-center min-h-[44px] py-3 rounded-xl bg-success text-emerald-900 text-[13px] font-bold active:scale-95 transition-transform"
          >
            View Digital BIB
          </Link>
          <Link
            href={`/runner/events/${eventId}`}
            className="inline-flex items-center min-h-[44px] text-[12px] font-bold text-muted-foreground underline underline-offset-2"
          >
            Back to Event
          </Link>
        </>
      )}
    </div>
  )
}

/** failed | expired — clear reason, prominent retry that starts a NEW attempt. */
export function PaymentErrorState({
  kind,
  reason,
  onRetry,
}: {
  kind: 'failed' | 'expired'
  reason?: string | null
  onRetry: () => void
}) {
  const expired = kind === 'expired'
  return (
    <StateCard>
      {expired ? (
        <Hourglass className="size-[40px] text-muted-foreground" aria-hidden="true" />
      ) : (
        <CircleAlert className="size-[40px] text-destructive" aria-hidden="true" />
      )}
      <div>
        <h3 className="text-[15px] font-bold text-foreground">
          {expired ? 'Payment session expired' : "Payment didn't go through"}
        </h3>
        <p className="text-[12px] text-muted-foreground mt-1">
          {reason ??
            (expired
              ? 'The payment session timed out before it was completed. Start a new payment to continue.'
              : 'No payment was taken. You can safely try again.')}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="w-full inline-flex items-center justify-center min-h-[44px] py-3 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold active:scale-95 transition-transform"
      >
        Try Again
      </button>
    </StateCard>
  )
}

/**
 * Poll-timeout neutral state (W-3-safe): the HitPay checkout may still be
 * settling server-side — retrying would risk a double charge. NO retry CTA.
 */
export function StillConfirmingState() {
  return (
    <StateCard className="min-h-[168px] justify-center">
      <Hourglass className="size-[40px] text-muted-foreground" aria-hidden="true" />
      <div>
        <h3 className="text-[15px] font-bold text-foreground">
          Still confirming your payment
        </h3>
        <p className="text-[12px] text-muted-foreground mt-1">
          We&apos;re still confirming your payment. Please check back in a few
          minutes — do NOT pay again while it is confirming.
        </p>
      </div>
    </StateCard>
  )
}

/** Idle entry card for the HitPay flow: what you pay and how. */
export function PayMethodCard({ amount, onStart }: { amount: number; onStart: () => void }) {
  return (
    <section className="bg-card rounded-2xl border border-border/60 p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="size-[20px] text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-bold text-foreground">DuitNow QR / FPX</span>
          <span className="text-[12px] text-muted-foreground">
            Scan with your banking app, or pay by FPX online banking / e-wallet. Secured by HitPay.
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="w-full inline-flex items-center justify-center min-h-[44px] py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold active:scale-95 transition-transform"
      >
        Pay RM {amount}
      </button>
    </section>
  )
}
