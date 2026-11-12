'use client'

import { Bell } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Header bell (in-app badge). Starts from the server-rendered unread count
 * when given; when omitted (client layouts, e.g. the organizer header) it
 * fetches the count itself. Bumps live on new rows via realtime (RLS limits
 * the stream to the user's own notifications). Mirrors the count onto the
 * installed app icon where the Badging API exists. `href` points at the
 * role's notifications page (runner by default, organizer header passes its
 * own).
 */
export function NotificationBell({
  userId,
  initialUnread,
  href = '/runner/notifications',
}: {
  userId?: string
  initialUnread?: number
  href?: string
}) {
  const [unread, setUnread] = useState(initialUnread ?? 0)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      // A failed badge fetch/subscribe is non-fatal (page still works) — the
      // component is rendered in client layouts where mocks/envs may not
      // support the full query chain; never leak an unhandled rejection.
      try {
        let uid = userId
        // Client-layout usage (no server-provided props): resolve the user and
        // the unread count via the user-scoped RLS read.
        if (!uid) {
          const { data: { user } } = await supabase.auth.getUser()
          uid = user?.id
          if (cancelled || !uid) return
        }
        if (initialUnread === undefined) {
          const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .is('read_at', null)
          if (!cancelled && count !== null) setUnread(count)
        }

        channel = supabase
          .channel(`notifications:${uid}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
            () => setUnread((n) => n + 1)
          )
          .subscribe()
      } catch {
        // keep the bell renderable without a count
      }
    }
    void init()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId, initialUnread])

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (unread > 0) nav.setAppBadge?.(unread).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [unread])

  return (
    <Link
      href={href}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
    >
      <Bell className="size-[22px]" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 dark:bg-red-400 text-white text-[10px] font-bold leading-[18px] text-center ring-2 ring-background">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}
