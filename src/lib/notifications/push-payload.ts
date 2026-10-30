/**
 * Push payload handling for the service worker (src/app/sw.ts). The
 * dispatcher (supabase/functions/_shared/notification-templates.ts →
 * buildPushPayload) sends `{ id, title, body, url, tag }` as JSON. Kept
 * pure so it is unit-tested outside the worker.
 */

export interface PushMessage {
  title: string
  options: NotificationOptions & { data: { url: string; id: string | null } }
}

const FALLBACK_URL = '/runner/notifications'

/** Only same-origin app paths may be opened from a notification click. */
export function safeNotificationPath(value: unknown): string {
  if (typeof value !== 'string') return FALLBACK_URL
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return FALLBACK_URL
  return value
}

export function parsePushMessage(raw: string | null | undefined): PushMessage {
  let data: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
    } catch {
      data = { body: raw }
    }
  }
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  return {
    title: text(data.title, 120) || 'Pelikat',
    options: {
      body: text(data.body, 300),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: text(data.tag, 120) || undefined,
      data: {
        url: safeNotificationPath(data.url),
        id: typeof data.id === 'string' ? data.id : null,
      },
    },
  }
}
