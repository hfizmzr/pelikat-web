import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NotificationList, type InboxItem } from '@/components/notifications/notification-list'

export const metadata: Metadata = {
  title: 'Notifications - Organizer Hub | Pelikat',
  description: 'Registration activity, payments and platform updates for your organization',
}

// Organizer mirror of /runner/notifications: same inbox data source
// (notifications table, user-scoped RLS) and the same NotificationList UI.
export default async function OrganizerNotificationsPage() {
  const supabase = await createClient()

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
    <div className="flex flex-col w-full min-h-full bg-background px-6 py-8">
      <div className="flex flex-col gap-5 max-w-2xl w-full mx-auto">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase w-fit">
            Inbox
          </span>
          <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">Notifications</h1>
          <p className="text-[14px] leading-[20px] text-muted-foreground">Registration activity, payments and platform updates.</p>
        </div>
        <NotificationList items={items} />
      </div>
    </div>
  )
}
