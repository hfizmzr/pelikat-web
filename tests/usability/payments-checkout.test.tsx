import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'


// ── Hoisted mock state ──────────────────────────────────────────
const h = vi.hoisted(() => {
  const state = {
    registration: {
      id: 'reg-1',
      bib_number: null as string | null,
      payment_status: 'pending',
      checked_in: false,
      events: { name: 'Pelikat Night Run 2026', event_date: '2026-12-01', location: 'Dataran Bandaraya' },
      race_categories: { name: '10K', price: 65 },
    },
    realtimeCallbacks: [] as Array<(payload: { new: { status?: string } }) => void>,
  }
  return state
})

const { createCheckout, confirmPayment, confirmDummyPayment, createHitpayCheckout, getPaymentStatus } =
  vi.hoisted(() => ({
    createCheckout: vi.fn(),
    confirmPayment: vi.fn(),
    confirmDummyPayment: vi.fn(),
    createHitpayCheckout: vi.fn(),
    getPaymentStatus: vi.fn(),
  }))

vi.mock('@/lib/payments/mock', () => ({
  createCheckout,
  confirmPayment,
  // mirrors the shared client gate (build-time NEXT_PUBLIC literal) so the
  // real vi.stubEnv(NEXT_PUBLIC_PAYMENT_PROVIDER, ...) controls the flow
  getPaymentProvider: () =>
    process.env.NEXT_PUBLIC_PAYMENT_PROVIDER === 'hitpay' ? 'hitpay' : 'mock',
}))

vi.mock('@/components/events/actions', () => ({
  confirmDummyPayment: vi.fn(),
  createHitpayCheckout,
  getPaymentStatus,
}))

// the runner payment page now imports the dummy-confirmation action from its
// defining module ("use server" files may not re-export other actions), so
// mock it at its import site to keep the server-only module out of the graph
vi.mock('@/lib/actions/payments', () => ({
  confirmDummyPayment,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: 'evt-1' }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = {
      on: (_type: string, _opts: unknown, cb: (payload: { new: { status?: string } }) => void) => {
        h.realtimeCallbacks.push(cb)
        return channel
      },
      subscribe: () => channel,
    }
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1', email: 'runner@example.my' } } }),
      },
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          single: async () => {
            if (table === 'runner_profiles') return { data: { id: 'rp-1', full_name: 'Abu Runner' } }
            if (table === 'registrations') return { data: h.registration, error: null }
            return { data: null, error: null }
          },
        }
        return builder
      },
      channel: (_name: string) => channel,
      removeChannel: vi.fn(),
    }
  },
}))

import PaymentPage from '@/app/runner/events/[id]/payment/page'

function renderPage(url = '/runner/events/evt-1/payment') {
  window.history.replaceState({}, '', url)
  // useParams() (not React.use(params)): never suspends, so a plain sync
  // render commits and subsequent findBy* handle the async data layer.
  return render(<PaymentPage />)
}

const HITPAY_RESULT = {
  ok: true as const,
  checkoutUrl: 'https://sandbox.hit-pay.com/checkout/abc123',
  qrCode:
    '00020101021226610014A0000006150001010658820102115904137560062205010301055204581253034585802MY5914PELIKAT RUN6009KUALA LUMPUR6215010310500553045A02',
  providerRequestId: 'pr-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.realtimeCallbacks.length = 0
  h.registration = { ...h.registration, bib_number: null, payment_status: 'pending' }
  vi.unstubAllEnvs()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function enterHitpayQr() {
  vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
  createHitpayCheckout.mockResolvedValue(HITPAY_RESULT)
renderPage()
  await screen.findByText('Complete Registration')
  fireEvent.click(screen.getByRole('button', { name: /pay rm 65/i }))
  await screen.findByRole('img', { name: /duitnow qr/i })
}

describe('Usability: Payments checkout (HitPay gateway)', () => {
  it('renders the DuitNow QR payload in-app as a scannable code with amount, event and scan copy', async () => {
    await enterHitpayQr()

    // The raw payload is rendered as a real QR code, not pushed off-app
    const qr = screen.getByRole('img', { name: /duitnow qr/i })
    expect(qr).toBeInTheDocument()
    expect(qr.getAttribute('data-qr-payload')).toBe(HITPAY_RESULT.qrCode)
    // QR SVG is generated asynchronously
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull())

    // Trust + clarity copy: amount, event, what to do next
    expect(screen.getAllByText(/RM\s*65/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Pelikat Night Run 2026/).length).toBeGreaterThan(0)
    expect(screen.getByText(/scan with your banking app/i)).toBeInTheDocument()

    // While the QR is shown we are not redirecting away
    expect(screen.queryByText(/redirecting/i)).not.toBeInTheDocument()
  })

  it('falls back to the hosted checkout link when no QR payload is returned', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
    createHitpayCheckout.mockResolvedValue({ ...HITPAY_RESULT, qrCode: null })
    renderPage()
    await screen.findByText('Complete Registration')
    fireEvent.click(screen.getByRole('button', { name: /pay rm 65/i }))

    // Brief redirect interstitial with a manual fallback link
    await screen.findByText(/redirecting/i)
    const fallback = await screen.findByRole('link', { name: /tap here|not redirected/i })
    expect(fallback.getAttribute('href')).toBe(HITPAY_RESULT.checkoutUrl)
  })

  it('transitions awaiting → confirmed on a simulated Realtime UPDATE and shows the assigned BIB', async () => {
    await enterHitpayQr()

    // Runner taps "I've paid" → awaiting
    fireEvent.click(screen.getByRole('button', { name: /i'?ve paid/i }))
    expect(await screen.findByText(/confirming your payment/i)).toBeInTheDocument()

    // Django webhook flips the payments row; realtime UPDATE arrives
    h.registration = { ...h.registration, bib_number: '0042', payment_status: 'paid' }
    expect(h.realtimeCallbacks.length).toBeGreaterThan(0)
    await act(async () => {
      h.realtimeCallbacks.forEach((cb) => cb({ new: { status: 'completed' } }))
    })

    expect(await screen.findByText(/payment successful/i)).toBeInTheDocument()
    expect(screen.getByText('0042')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view digital bib/i })).toBeInTheDocument()
  })

  it('shows a clear failure state with retry that creates a NEW checkout attempt', async () => {
    await enterHitpayQr()
    fireEvent.click(screen.getByRole('button', { name: /i'?ve paid/i }))
    await screen.findByText(/confirming your payment/i)

    await act(async () => {
      h.realtimeCallbacks.forEach((cb) => cb({ new: { status: 'failed' } }))
    })

    expect(await screen.findByText(/payment (didn'?t|did not) go through|payment failed/i)).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: /try again|retry/i })
    expect(retry).toBeInTheDocument()

    expect(createHitpayCheckout).toHaveBeenCalledTimes(1)
    fireEvent.click(retry)
    await waitFor(() => expect(createHitpayCheckout).toHaveBeenCalledTimes(2))
    // New attempt re-enters the QR flow
    await screen.findByRole('img', { name: /duitnow qr/i })
  })

  it('never trusts URL params alone: ?status=paid still shows confirming, only server truth confirms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
    getPaymentStatus.mockResolvedValue({ status: 'pending', paymentRail: null })

    renderPage("/runner/events/evt-1/payment?reference=pr-1&status=paid")
    await screen.findByText('Complete Registration')

    // Returned from hosted checkout → awaiting, driven only by realtime/poll
    expect(await screen.findByText(/confirming your payment/i)).toBeInTheDocument()
    expect(screen.queryByText(/payment successful/i)).not.toBeInTheDocument()

    // Poll returns server truth: still pending → still awaiting
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(getPaymentStatus).toHaveBeenCalledWith('reg-1')
    expect(screen.queryByText(/payment successful/i)).not.toBeInTheDocument()

    // Only when the server reports completion does it confirm
    getPaymentStatus.mockResolvedValue({ status: 'completed', paymentRail: 'duitnow_qr' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => expect(screen.getByText(/payment successful/i)).toBeInTheDocument())
  })

  it('polls getPaymentStatus every 3s while awaiting and expires after the 5-minute cap', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
    createHitpayCheckout.mockResolvedValue(HITPAY_RESULT)
  getPaymentStatus.mockResolvedValue({ status: 'pending', paymentRail: null })

    renderPage()
    await screen.findByText('Complete Registration')
    fireEvent.click(screen.getByRole('button', { name: /pay rm 65/i }))
    await screen.findByRole('img', { name: /duitnow qr/i })
    fireEvent.click(screen.getByRole('button', { name: /i'?ve paid/i }))
    await screen.findByText(/confirming your payment/i)

    const callsBefore = getPaymentStatus.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(getPaymentStatus.mock.calls.length).toBeGreaterThan(callsBefore)

    // Cap: 5 minutes → ONE final authoritative fetch; still pending → the
    // neutral still-confirming phase (never expired/retry — W-3-safe).
    expect(screen.queryByText(/expired|timed out/i)).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    const final = getPaymentStatus.mock.calls.length
    expect(final).toBeGreaterThan(callsBefore)
    expect(await screen.findByRole('heading', { name: /still confirming/i })).toBeInTheDocument()
    expect(screen.getByText(/do NOT pay again/i)).toBeInTheDocument()
    // No retry CTA on the still-confirming phase (retry ⇒ double charge risk)
    expect(screen.queryByRole('button', { name: /try again|retry|pay rm/i })).not.toBeInTheDocument()
  })

  it('poll-timeout resolves to confirmed when the final fetch reports completion', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
    createHitpayCheckout.mockResolvedValue(HITPAY_RESULT)
    getPaymentStatus.mockResolvedValue({ status: 'pending', paymentRail: null })

    renderPage()
    await screen.findByText('Complete Registration')
    fireEvent.click(screen.getByRole('button', { name: /pay rm 65/i }))
    await screen.findByRole('img', { name: /duitnow qr/i })
    fireEvent.click(screen.getByRole('button', { name: /i'?ve paid/i }))
    await screen.findByText(/confirming your payment/i)

    getPaymentStatus.mockResolvedValue({ status: 'completed', paymentRail: 'fpx' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })
    await waitFor(() =>
      expect(screen.getByText(/payment successful/i)).toBeInTheDocument()
    )
  })

  it('already-paid registrations never create a second checkout: tapping pay shows the confirmed state', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
    h.registration = { ...h.registration, bib_number: '0042', payment_status: 'paid' }
    createHitpayCheckout.mockResolvedValue({ ok: true, alreadyPaid: true })
    renderPage()
    await screen.findByText('Complete Registration')

    // tapping pay again (server already reports paid via this device race)
    fireEvent.click(screen.getByRole('button', { name: /pay rm 65/i }))
    // The confirmed effect refetches bib from the registration row.
    expect(await screen.findByText(/payment successful/i)).toBeInTheDocument()
    expect(screen.getAllByText('0042').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img', { name: /duitnow qr/i })).not.toBeInTheDocument()
  })

  it('mock provider path still works: Confirm Payment → dummy confirm → success', async () => {
    createCheckout.mockResolvedValue({
      provider: 'mock',
      reference: 'mock_reg1_abc',
      checkoutUrl: '/mock-checkout/x',
      amount: 65,
      currency: 'MYR',
    })
    confirmPayment.mockResolvedValue({
      provider: 'mock',
      reference: 'mock_reg1_abc',
      status: 'paid',
      paidAt: new Date().toISOString(),
    })
    confirmDummyPayment.mockResolvedValue(undefined)

    renderPage()
    await screen.findByText('Complete Registration')

    // Mock path keeps its explicit disclosure + Confirm button
    expect(screen.getByText(/simulates/i)).toBeInTheDocument()
    expect(screen.getByText(/no real transaction/i)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /duitnow qr/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /confirm payment/i }))

    await waitFor(() => expect(confirmDummyPayment).toHaveBeenCalledWith('reg-1'))
    expect(await screen.findByText(/payment successful/i)).toBeInTheDocument()
    expect(createHitpayCheckout).not.toHaveBeenCalled()
  })

  it('shows the failed state with a retry when the checkout action returns ok:false (422 rails)', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
    createHitpayCheckout.mockResolvedValue({
      ok: false,
      error: 'Payment methods are temporarily unavailable. Please try again shortly or contact support.',
    })
    renderPage()
    await screen.findByText('Complete Registration')
    fireEvent.click(screen.getByRole('button', { name: /pay rm 65/i }))

    expect(await screen.findByText(
      /Payment methods are temporarily unavailable/i
    )).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /duitnow qr/i })).not.toBeInTheDocument()
  })

  it('state changes are announced (aria-live polite region present)', async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENT_PROVIDER', 'hitpay')
    createHitpayCheckout.mockResolvedValue(HITPAY_RESULT)
  renderPage()
    await screen.findByText('Complete Registration')

    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')

    fireEvent.click(screen.getByRole('button', { name: /pay rm 65/i }))
    // State region still present in QR phase
    await screen.findByRole('img', { name: /duitnow qr/i })
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('primary payment actions declare explicit ≥44px touch-target sizing in source', () => {
    const files = [
      join(process.cwd(), 'src', 'app', 'runner', 'events', '[id]', 'payment', 'page.tsx'),
      join(process.cwd(), 'src', 'components', 'payments', 'duitnow-qr-panel.tsx'),
      join(process.cwd(), 'src', 'components', 'payments', 'checkout-states.tsx'),
    ]
    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const hasTarget = /min-h-\[44px\]|min-h-11|h-11|h-\[44px\]|py-3\.5/.test(content)
      expect(hasTarget, `${file} should declare ≥44px touch targets`).toBe(true)
    }
  })
})
