'use client'

import { ArrowLeft, CircleAlert, CreditCard, LoaderCircle, ReceiptText, TriangleAlert } from "lucide-react"
import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { createHitpayCheckout, getPaymentStatus } from '@/components/events/actions'
import { confirmDummyPayment } from '@/lib/actions/payments'
import { createCheckout, confirmPayment, getPaymentProvider } from '@/lib/payments/mock'
import DuitNowQrPanel from '@/components/payments/duitnow-qr-panel'
import {
  CreatingState,
  RedirectingState,
  AwaitingState,
  ConfirmedState,
  PaymentErrorState,
  StillConfirmingState,
  PayMethodCard,
} from '@/components/payments/checkout-states'

type HitpayPhase =
  | 'idle'
  | 'creating'
  | 'qr_display'
  | 'redirecting'
  | 'awaiting'
  | 'confirmed'
  | 'pending_still'
  | 'failed'
  | 'expired'

interface CheckoutIntent {
  checkoutUrl: string
  qrCode: string | null
  providerRequestId: string
}

// Gate: getPaymentProvider() from '@/lib/payments/mock' — the one shared
// client gate in the app (build-time NEXT_PUBLIC_PAYMENT_PROVIDER literal).

// Uses useParams() instead of React.use(params): the promise returned by
// Next 16 suspends the whole tree on first render, which breaks hydration
// recovery in low-trust embed contexts; useParams never suspends.
export default function PaymentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  // Stable Supabase client instance. createClient() returns a NEW object on
  // every call; capturing it in state keeps effect deps referentially stable
  // and prevents effect ↔ re-render loops (e.g. same-value setBibNumber
  // in the confirmation effect).
  const [supabase] = useState(() => createClient())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<HitpayPhase>('idle')
  const [checkout, setCheckout] = useState<CheckoutIntent | null>(null)
  const [failureReason, setFailureReason] = useState<string | null>(null)
  const [bibNumber, setBibNumber] = useState<string | null>(null)
  const [contact, setContact] = useState<{ email: string; name: string }>({ email: '', name: '' })
  const [registration, setRegistration] = useState<{
    id: string
    bib_number: string
    payment_status: string
    checked_in: boolean
    events: { name: string; event_date: string; location?: string; event_type?: string }
    race_categories: { name: string; price: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('id, full_name')
        .eq('user_id', user?.id)
        .single()

      const { data: reg } = await supabase
        .from('registrations')
        .select('*, events(*), race_categories(*)')
        .eq('event_id', id)
        .eq('runner_id', profile?.id)
        .single()

      setRegistration(reg)
      setContact({ email: user?.email ?? '', name: profile?.full_name ?? '' })
      setLoading(false)
    })()
  }, [id, supabase])

  // ── HitPay: return from hosted checkout ───────────────────────
  // The gateway appends ?reference=&status= to the return URL. Those
  // values are NEVER trusted for state — their presence only means
  // "we came back from the hosted checkout", confirmation is driven
  // exclusively by Realtime/poll below.
  useEffect(() => {
    if (getPaymentProvider() !== 'hitpay') return
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.has('reference') || urlParams.has('status')) {
      setPhase('awaiting')
    }
  }, [])

  // ── HitPay: hosted-checkout handoff ───────────────────────────
  const redirectedRef = useRef(false)

  const startCheckout = useCallback(async () => {
    if (!registration) return
    setError(null)
    setFailureReason(null)
    redirectedRef.current = false
    setPhase('creating')
    try {
      const res = await createHitpayCheckout({
        registrationId: registration.id,
        email: contact.email,
        name: contact.name,
      })
      if (res.ok) {
        if ('alreadyPaid' in res) {
          // ALREADY-PAD: registration is paid — render the confirmed state
          // (the BIB effect below fetches it from the registration row),
          // never a second checkout.
          setPhase('confirmed')
          return
        }
        setCheckout(res)
        setPhase(res.qrCode ? 'qr_display' : 'redirecting')
      } else {
        setFailureReason(res.error)
        setPhase('failed')
      }
    } catch (e) {
      setFailureReason(
        e instanceof Error ? e.message : 'Could not start the payment. Please try again.'
      )
      setPhase('failed')
    }
  }, [registration, contact])

  // ── HitPay: hosted-checkout handoff timer ─────────────────────
  useEffect(() => {
    if (phase !== 'redirecting' || !checkout?.checkoutUrl || redirectedRef.current) return
    redirectedRef.current = true
    const timer = setTimeout(() => {
      window.location.href = checkout.checkoutUrl
    }, 1200)
    return () => clearTimeout(timer)
  }, [phase, checkout])

  // ── HitPay: confirmation watcher (Realtime + poll fallback) ──
  // Active while the QR is on screen or we're awaiting confirmation.
  // payments.status is flipped by Django's webhook via confirm_payment.
  const watching = phase === 'qr_display' || phase === 'awaiting'
  const registrationId = registration?.id
  useEffect(() => {
    if (!watching || !registrationId || getPaymentProvider() !== 'hitpay') return
    const applyStatus = (status?: string | null) => {
      if (cancelled) return
      if (status === 'completed' || status === 'paid') {
        setPhase('confirmed')
      } else if (status === 'failed') {
        setFailureReason('The payment was not completed — no charge was made.')
        setPhase('failed')
      } else if (status === 'expired' || status === 'canceled') {
        setPhase('expired')
      }
    }

    let cancelled = false

    const channel = supabase
      .channel(`payment-status-${registrationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `registration_id=eq.${registrationId}`,
        },
        (payload) => {
          const next = payload.new as { status?: string } | null
          applyStatus(next?.status)
        }
      )
      .subscribe()

    const POLL_MS = 3000
    const MAX_WAIT_MS = 5 * 60 * 1000
    const startedAt = Date.now()
    const poll = setInterval(async () => {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        clearInterval(poll)
        // W-3-safe timeout: the checkout may still be settling at HitPay,
        // so the 5-minute cap must NEVER flip to expired/retry. One final
        // authoritative fetch decides the phase.
        try {
          const final = await getPaymentStatus(registrationId)
          if (!cancelled) {
            if (final?.status === 'completed' || final?.status === 'paid') {
              setPhase('confirmed')
            } else if (final?.status === 'failed') {
              setFailureReason('The payment was not completed — no charge was made.')
              setPhase('failed')
            } else if (final?.status === 'expired' || final?.status === 'canceled') {
              setPhase('expired')
            } else {
              setPhase('pending_still')
            }
          }
        } catch {
          if (!cancelled) setPhase('pending_still')
        }
        return
      }
      try {
        const status = await getPaymentStatus(registrationId)
        if (!cancelled) applyStatus(status?.status)
      } catch {
        // Transient network error — the next tick retries.
      }
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [watching, registrationId, supabase])

  // ── Confirmed: pull the assigned BIB from the registration row ─
  useEffect(() => {
    if (phase !== 'confirmed' || !registrationId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('registrations')
        .select('bib_number')
        .eq('id', registrationId)
        .single()
      if (!cancelled && data?.bib_number) setBibNumber(data.bib_number)
    })()
    return () => {
      cancelled = true
    }
  }, [phase, registrationId, supabase])

  // ── Focus management on state transitions ─────────────────────
  const stateRegionRef = useRef<HTMLDivElement>(null)
  const prevPhaseRef = useRef(phase)
  useEffect(() => {
    if (prevPhaseRef.current !== phase && getPaymentProvider() === 'hitpay') {
      stateRegionRef.current?.focus()
    }
    prevPhaseRef.current = phase
  }, [phase])

  const handleMockPayment = () => {
    setError(null)
    startTransition(async () => {
      try {
        if (!registration) throw new Error('Registration not found')

        // Mock gateway flow (PAYMENT_PROVIDER=mock) — kept for tests
        // and local dev. confirm_dummy_payment then applies the DB
        // state (ownership check, pending→paid, audit) unchanged.
        const session = await createCheckout({
          amount: registration.race_categories?.price ?? 0,
          description: `Registration ${registration.bib_number} — ${registration.events?.name}`,
          referenceId: registration.id,
          metadata: { type: 'event_registration', bib_number: registration.bib_number },
        })
        await confirmPayment(session)

        await confirmDummyPayment(registration.id)
        setBibNumber(registration.bib_number ?? null)
        setPhase('confirmed')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Payment failed')
      }
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col w-full min-h-full bg-background items-center justify-center">
        <LoaderCircle className="size-[32px] text-muted-foreground animate-spin motion-reduce:animate-none" />
      </div>
    )
  }

  if (!registration) {
    return (
      <div className="flex flex-col w-full min-h-full bg-background items-center justify-center px-5 text-center">
        <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-4 border border-border/60">
          <TriangleAlert className="size-[32px] text-muted-foreground" />
        </div>
        <p className="text-[14px] text-foreground font-bold mb-4">Registration not found</p>
        <Link
          href={`/runner/events/${id}`}
          className="px-6 py-3 rounded-xl bg-accent text-accent-foreground text-[13px] font-bold"
        >
          Back to Event
        </Link>
      </div>
    )
  }

  const isHitpay = getPaymentProvider() === 'hitpay'
  const amount = registration.race_categories?.price ?? 0

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href={`/runner/events/${id}`} className="w-11 h-11 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <ArrowLeft className="size-[24px]" />
          </Link>
          <h1 className="flex-1 text-[16px] font-bold text-foreground text-center mr-8 truncate">
            Payment
          </h1>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto">
        <div className="flex flex-col text-center">
          <h2 className="text-[20px] font-bold text-foreground mb-1">Complete Registration</h2>
          <p className="text-[13px] text-muted-foreground">{registration.events?.name}</p>
        </div>

        <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
          <div className="bg-muted p-4 flex items-center gap-2 border-b border-border/60">
            <ReceiptText className="size-[18px] text-muted-foreground" />
            <span className="text-[14px] font-bold text-foreground">Order Summary</span>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-muted-foreground">Category</span>
              <span className="text-foreground font-medium">{registration.race_categories?.name}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-muted-foreground">BIB</span>
              <span className="font-mono text-foreground font-medium">{registration.bib_number ?? 'TBA'}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-muted-foreground">Status</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent text-muted-foreground">
                {registration.payment_status}
              </span>
            </div>
            <div className="border-t border-border/40 pt-3 mt-1 flex justify-between items-center">
              <span className="text-[14px] font-bold text-foreground">Total to Pay</span>
              <span className="text-[16px] font-bold text-primary">RM {amount}</span>
            </div>
          </div>
        </section>

        {isHitpay ? (
          <div ref={stateRegionRef} tabIndex={-1} role="status" aria-live="polite" className="flex flex-col rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {phase === 'idle' && <PayMethodCard amount={amount} onStart={startCheckout} />}
            {phase === 'creating' && <CreatingState />}

            {phase === 'qr_display' && checkout?.qrCode && (
              <DuitNowQrPanel
                payload={checkout.qrCode}
                amount={amount}
                eventName={registration.events?.name ?? ''}
                fallbackUrl={checkout.checkoutUrl}
                onPaid={() => setPhase('awaiting')}
              />
            )}
            {phase === 'qr_display' && !checkout?.qrCode && <RedirectingState checkoutUrl={checkout?.checkoutUrl} />}

            {phase === 'redirecting' && <RedirectingState checkoutUrl={checkout?.checkoutUrl} />}

            {phase === 'awaiting' && <AwaitingState />}

            {phase === 'confirmed' && <ConfirmedState bibNumber={bibNumber} eventId={id} eventType={registration.events?.event_type} />}

            {(phase === 'failed' || phase === 'expired') && (
              <PaymentErrorState kind={phase} reason={failureReason} onRetry={startCheckout} />
            )}

            {phase === 'pending_still' && <StillConfirmingState />}
          </div>
        ) : (
          <>
            {phase === 'confirmed' ? (
              <ConfirmedState bibNumber={bibNumber} eventId={id} eventType={registration.events?.event_type} />
            ) : (
              <section className="bg-card rounded-2xl border border-border/60 p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <CreditCard className="size-[20px] text-primary" />
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-foreground">Mock Gateway</span>
                    <span className="text-[12px] text-muted-foreground">This simulates a successful payment (PAYMENT_PROVIDER=mock). No real transaction occurs.</span>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12px] flex items-center gap-2">
                    <CircleAlert className="size-[16px]" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleMockPayment}
                  disabled={isPending}
                  className="w-full py-3.5 mt-2 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <LoaderCircle className="size-[18px] animate-spin motion-reduce:animate-none" />
                      Processing...
                    </>
                  ) : (
                    'Confirm Payment'
                  )}
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
