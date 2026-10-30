'use client'

import type { LucideIcon } from 'lucide-react'
import { BellRing, CheckCheck, Megaphone, Ticket, Trophy } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface InboxItem {
  id: string
  kind: 'registration_confirmed' | 'results_published' | 'broadcast' | 'test'
  title: string
  body: string
  url: string | null
  read_at: string | null
  created_at: string
  event_name: string | null
}

const KIND_META: Record<InboxItem['kind'], { icon: LucideIcon; label: string }> = {
  registration_confirmed: { icon: Ticket, label: 'Registration' },
  results_published: { icon: Trophy, label: 'Results' },
  broadcast: { icon: Megaphone, label: 'Organizer' },
  test: { icon: BellRing, label: 'Test' },
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

export function NotificationList({ items: initial }: { items: InboxItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const unread = items.filter((i) => !i.read_at).length

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((i) => (ids.includes(i.id) && !i.read_at ? { ...i, read_at: now } : i)))
    await createClient().from('notifications').update({ read_at: now }).in('id', ids).is('read_at', null)
  }

  const open = (item: InboxItem) => {
    void markRead([item.id])
    // Broadcasts carry the full message here; everything else jumps to its page
    if (item.kind === 'broadcast' || !item.url) {
      setExpanded((cur) => (cur === item.id ? null : item.id))
      return
    }
    router.push(item.url)
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-12 gap-2">
        <BellRing className="size-[32px] text-muted-foreground" />
        <p className="text-[14px] font-bold text-foreground">No notifications yet</p>
        <p className="text-[12px] text-muted-foreground max-w-[260px]">
          Registration confirmations, results and messages from organizers will show up here.
        </p>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
          {unread > 0 ? `${unread} unread` : 'All caught up'}
        </h2>
        {unread > 0 && (
          <button
            onClick={() => startTransition(() => markRead(items.filter((i) => !i.read_at).map((i) => i.id)))}
            disabled={isPending}
            className="flex items-center gap-1 text-[12px] font-bold text-primary disabled:opacity-50"
          >
            <CheckCheck className="size-[14px]" />
            Mark all read
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const meta = KIND_META[item.kind] ?? KIND_META.test
          const Icon = meta.icon
          const isOpen = expanded === item.id
          return (
            <li key={item.id}>
              <button
                onClick={() => open(item)}
                aria-expanded={item.kind === 'broadcast' ? isOpen : undefined}
                className={`w-full text-left flex gap-3 p-4 rounded-2xl border transition-colors active:scale-[0.99] ${
                  item.read_at ? 'bg-card border-border/60' : 'bg-primary/5 border-primary/30'
                }`}
              >
                <span className={`p-2 h-fit rounded-xl shrink-0 ${item.read_at ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                      {meta.label}
                      {item.event_name ? ` · ${item.event_name}` : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.created_at)}</span>
                  </span>
                  <span className="block text-[14px] font-bold text-foreground mt-0.5">{item.title}</span>
                  <span
                    className={`block text-[12px] text-muted-foreground mt-0.5 whitespace-pre-line ${isOpen ? '' : 'line-clamp-2'}`}
                  >
                    {item.body}
                  </span>
                </span>
                {!item.read_at && <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" aria-label="Unread" />}
              </button>
              {isOpen && item.url && (
                <Link href={item.url} className="inline-block mt-1.5 ml-[60px] text-[12px] font-bold text-primary">
                  Open event →
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
