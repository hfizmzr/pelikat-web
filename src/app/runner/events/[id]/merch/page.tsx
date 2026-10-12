import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getRunnerStoreData } from '@/components/merch/store/queries'
import { Storefront } from '@/components/merch/store/storefront'
import { StoreHeader } from '@/components/merch/store/store-ui'

export const metadata: Metadata = {
  title: 'Event Merch - Pelikat',
  description: 'Official merchandise for your event',
}

export default async function RunnerEventMerchPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, supabase] = await Promise.all([params, createClient()])
  const data = await getRunnerStoreData(supabase, id)
  const { event } = data

  if (!event) notFound()

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      <StoreHeader
        title="Event Merch"
        subtitle={event.name}
        backHref={`/runner/events/${event.id}`}
        action={
          <Link
            href="/runner/merch"
            aria-label="My merch orders"
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d]"
          >
            <span className="material-symbols-outlined text-[22px]">receipt_long</span>
          </Link>
        }
      />

      {data.registered ? (
        <Storefront data={{ ...data, event }} />
      ) : (
        <div className="px-5 py-10 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 bg-[#1c1b1d] rounded-full flex items-center justify-center border border-[#353437]/60">
            <span className="material-symbols-outlined text-[32px] text-[#958ea0]">lock</span>
          </div>
          <p className="text-[15px] font-bold text-[#e5e1e4]">Register to shop</p>
          <p className="text-[13px] text-[#958ea0] max-w-[260px]">
            Event merch is available to runners registered for {event.name}.
          </p>
          <Link
            href={`/runner/events/${event.id}`}
            className="mt-2 px-6 py-3 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold"
          >
            View event
          </Link>
        </div>
      )}
    </div>
  )
}
