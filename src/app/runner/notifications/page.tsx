import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NotificationList, type InboxItem } from '@/components/notifications/notification-list'
import { PushSettingsCard } from '@/components/notifications/push-settings-card'

export const metadata: Metadata = {
  title: 'Notifications - Pelikat',
  description: 'Registration confirmations, results and organizer messages',
}

export default async function RunnerNotificationsPage() {
  const supabase = await createClient()

  // RLS returns only the signed-in runner's rows
  const { data } = await supabase
    .from('notifications')
    .select('id, kind, title, body, url, read_at, created_at, events(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  const items: InboxItem[] = (data ?? []).map((n) => {
    const event = Array.isArray(n.events) ? n.events[0] : n.events
    return {
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      url: n.url,
      read_at: n.read_at,
      created_at: n.created_at,
      event_name: event?.name ?? null,
    }
  })

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link
            href="/runner"
            aria-label="Back"
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2"
          >
            <ArrowLeft className="size-[24px]" />
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-foreground leading-tight">Notifications</h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-5 gap-5">
        <PushSettingsCard />
        <NotificationList items={items} />
      </div>
    </div>
  )
}
