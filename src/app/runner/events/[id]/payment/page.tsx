'use client'

import { use, useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { confirmDummyPayment } from '@/components/events/actions'
import { createCheckout, confirmPayment } from '@/lib/payments/mock'

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [registration, setRegistration] = useState<{
    id: string
    bib_number: string
    payment_status: string
    checked_in: boolean
    events: { name: string; event_date: string; location?: string }
    race_categories: { name: string; price: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      const { data: reg } = await supabase
        .from('registrations')
        .select('*, events(*), race_categories(*)')
        .eq('event_id', id)
        .eq('runner_id', profile?.id)
        .single()

      setRegistration(reg)
      setLoading(false)
    })()
  }, [id, supabase])

  const handlePayment = () => {
    setError(null)
    startTransition(async () => {
      try {
        if (!registration) throw new Error('Registration not found')

        // Mock gateway flow (PAYMENT_PROVIDER=mock) — swap point for the
        // real provider. confirm_dummy_payment then applies the DB state
        // (ownership check, pending→paid, audit) unchanged.
        const session = await createCheckout({
          amount: registration.race_categories?.price ?? 0,
          description: `Registration ${registration.bib_number} — ${registration.events?.name}`,
          referenceId: registration.id,
          metadata: { type: 'event_registration', bib_number: registration.bib_number },
        })
        await confirmPayment(session)

        await confirmDummyPayment(registration.id)
        setSuccess(true)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Payment failed')
      }
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col w-full min-h-full bg-[#131315] items-center justify-center">
        <span className="material-symbols-outlined text-[32px] text-[#cbc3d7] animate-spin">progress_activity</span>
      </div>
    )
  }

  if (!registration) {
    return (
      <div className="flex flex-col w-full min-h-full bg-[#131315] items-center justify-center px-5 text-center">
        <div className="w-16 h-16 bg-[#1c1b1d] rounded-full flex items-center justify-center mb-4 border border-[#353437]/60">
          <span className="material-symbols-outlined text-[32px] text-[#958ea0]">warning</span>
        </div>
        <p className="text-[14px] text-[#e5e1e4] font-bold mb-4">Registration not found</p>
        <Link 
          href={`/runner/events/${id}`}
          className="px-6 py-3 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold"
        >
          Back to Event
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href={`/runner/events/${id}`} className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <h1 className="flex-1 text-[16px] font-bold text-[#e5e1e4] text-center mr-8 truncate">
            Payment
          </h1>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto">
        <div className="flex flex-col text-center">
          <h2 className="text-[20px] font-bold text-[#e5e1e4] mb-1">Complete Registration</h2>
          <p className="text-[13px] text-[#958ea0]">{registration.events?.name}</p>
        </div>

        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden">
          <div className="bg-[#23232b] p-4 flex items-center gap-2 border-b border-[#353437]/60">
            <span className="material-symbols-outlined text-[18px] text-[#cbc3d7]">receipt_long</span>
            <span className="text-[14px] font-bold text-[#e5e1e4]">Order Summary</span>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#958ea0]">Category</span>
              <span className="text-[#e5e1e4] font-medium">{registration.race_categories?.name}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#958ea0]">BIB</span>
              <span className="font-mono text-[#e5e1e4] font-medium">{registration.bib_number}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#958ea0]">Status</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#353437] text-[#cbc3d7]">
                {registration.payment_status}
              </span>
            </div>
            <div className="border-t border-[#353437]/40 pt-3 mt-1 flex justify-between items-center">
              <span className="text-[14px] font-bold text-[#e5e1e4]">Total to Pay</span>
              <span className="text-[16px] font-bold text-[#4cd7f6]">RM {registration.race_categories?.price ?? 0}</span>
            </div>
          </div>
        </section>

        {success ? (
          <div className="bg-[#4edea3]/10 border border-[#4edea3]/30 p-5 rounded-2xl flex flex-col items-center text-center gap-3">
            <span className="material-symbols-outlined text-[40px] text-[#4edea3]">check_circle</span>
            <div>
              <h3 className="text-[16px] font-bold text-[#4edea3] mb-1">Payment Successful!</h3>
              <p className="text-[13px] text-[#4edea3]/80 mb-4">Your registration is confirmed. See you at the start line.</p>
              <Link 
                href={`/runner/events/${id}/bib`}
                className="inline-flex w-full py-3 rounded-xl bg-[#4edea3] text-[#003926] text-[13px] font-bold justify-center active:scale-95 transition-transform"
              >
                View Digital BIB
              </Link>
            </div>
          </div>
        ) : (
          <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px] text-[#d0bcff]">credit_score</span>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-[#e5e1e4]">Mock Gateway</span>
                <span className="text-[12px] text-[#958ea0]">This simulates a successful payment (PAYMENT_PROVIDER=mock). No real transaction occurs.</span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                {error}
              </div>
            )}

            <button 
              onClick={handlePayment} 
              disabled={isPending}
              className="w-full py-3.5 mt-2 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  Processing...
                </>
              ) : (
                'Confirm Payment'
              )}
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
