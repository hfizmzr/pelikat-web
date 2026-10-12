import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getRunnerStoreData } from '@/components/merch/store/queries'
import { Checkout } from '@/components/merch/store/checkout'
import { StoreHeader } from '@/components/merch/store/store-ui'

export const metadata: Metadata = {
  title: 'Checkout - Pelikat',
  description: 'Review your cart and pay',
}

export default async function RunnerMerchCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, supabase] = await Promise.all([params, createClient()])
  const data = await getRunnerStoreData(supabase, id)
  const { event } = data

  if (!event) notFound()
  if (!data.registered) redirect(`/runner/events/${id}/merch`)

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      <StoreHeader title="Checkout" subtitle={event.name} backHref={`/runner/events/${event.id}/merch`} />
      <Checkout data={{ ...data, event }} />
    </div>
  )
}
