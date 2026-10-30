/**
 * Browser side of Web Push (FR-31): feature detection, subscribing this
 * device with the platform VAPID key, and saving/removing the subscription
 * through the 084 RPCs. The service worker is registered by Serwist in
 * production builds only (next.config.ts disables it under `next dev`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type PushSupport =
  | 'supported'
  | 'unsupported' // browser has no Push API
  | 'ios-needs-install' // iOS/iPadOS 16.4+: only available from the Home Screen app
  | 'not-configured' // NEXT_PUBLIC_VAPID_PUBLIC_KEY missing

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

export function isIosDevice(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): boolean {
  // iPadOS reports a Mac user agent; touch points give it away
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
}

export function isStandaloneDisplay(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  // Safari on iOS only exposes PushManager to installed web apps
  if (isIosDevice() && !isStandaloneDisplay()) return 'ios-needs-install'
  return hasApis ? 'supported' : 'unsupported'
}

export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** The active SW registration, or null when none is installed (e.g. `next dev`). */
export async function getActiveRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg?.active ? reg : null
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getActiveRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function enablePush(supabase: SupabaseClient): Promise<void> {
  const reg = await getActiveRegistration()
  if (!reg) throw new Error('The app’s service worker is not active yet. Reload the page and try again.')

  // Must run inside the click handler: iOS only prompts from a user gesture
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked. Allow them for Pelikat in your browser or device settings.'
        : 'Notification permission was not granted.'
    )
  }

  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = subscription.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (error) {
    await subscription.unsubscribe().catch(() => {})
    throw new Error(error.message)
  }
}

export async function disablePush(supabase: SupabaseClient): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (!subscription) return
  const { error } = await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
  if (error) throw new Error(error.message)
  await subscription.unsubscribe()
}
