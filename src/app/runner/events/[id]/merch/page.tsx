import { Lock, ReceiptText } from "lucide-react"
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
    <div className="flex flex-col w-full min-h-full bg-background">
      <StoreHeader
        title="Event Merch"
        subtitle={event.name}
        backHref={`/runner/events/${event.id}`}
        action={
          <Link
            href="/runner/merch"
            aria-label="My merch orders"
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card"
          >
            <ReceiptText className="size-[22px]" />
          </Link>
        }
      />

      {data.registered ? (
        <Storefront data={{ ...data, event }} />
      ) : (
        <div className="px-5 py-10 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center border border-border/60">
            <Lock className="size-[32px] text-muted-foreground" />
          </div>
          <p className="text-[15px] font-bold text-foreground">Register to shop</p>
          <p className="text-[13px] text-muted-foreground max-w-[260px]">
            Event merch is available to runners registered for {event.name}.
          </p>
          <Link
            href={`/runner/events/${event.id}`}
            className="mt-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold"
          >
            View event
          </Link>
        </div>
      )}
    </div>
  )
}
