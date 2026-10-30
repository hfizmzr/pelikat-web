'use client'

import { BellOff, BellRing, LoaderCircle, Share, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  disablePush,
  enablePush,
  getActiveRegistration,
  getCurrentSubscription,
  getPushSupport,
  type PushSupport,
} from '@/lib/notifications/push-client'

type State =
  | { kind: 'loading' }
  | { kind: Exclude<PushSupport, 'supported'> }
  | { kind: 'no-worker' }
  | { kind: 'denied' }
  | { kind: 'ready'; subscribed: boolean }

/** FR-31: per-device push opt-in on the runner's notification page. */
export function PushSettingsCard() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const support = getPushSupport()
      let next: State
      if (support !== 'supported') next = { kind: support }
      else if (Notification.permission === 'denied') next = { kind: 'denied' }
      else if (!(await getActiveRegistration())) next = { kind: 'no-worker' }
      else next = { kind: 'ready', subscribed: !!(await getCurrentSubscription()) }
      if (!cancelled) setState(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = async () => {
    if (state.kind !== 'ready') return
    setBusy(true)
    const supabase = createClient()
    try {
      if (state.subscribed) {
        await disablePush(supabase)
        setState({ kind: 'ready', subscribed: false })
        toast.success('Push notifications turned off for this device')
      } else {
        await enablePush(supabase)
        setState({ kind: 'ready', subscribed: true })
        toast.success('Push notifications are on for this device')
      }
    } catch (err) {
      if (Notification.permission === 'denied') setState({ kind: 'denied' })
      toast.error(err instanceof Error ? err.message : 'Could not update push notifications')
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    const { error } = await createClient().rpc('send_test_notification')
    setBusy(false)
    if (error) toast.error(error.message)
    else toast.success('Test sent — it should arrive in a few seconds')
  }

  return (
    <section className="p-4 rounded-2xl bg-card border border-border/60 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
          {state.kind === 'ready' && state.subscribed ? <BellRing className="size-[20px]" /> : <Smartphone className="size-[20px]" />}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold text-foreground">Push notifications</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">{describe(state)}</p>
        </div>
      </div>

      {state.kind === 'ios-needs-install' && (
        <ol className="text-[12px] text-muted-foreground space-y-1.5 pl-1">
          <li className="flex items-center gap-1.5">
            1. Tap <Share className="size-[14px] text-foreground" aria-label="Share" /> in Safari
          </li>
          <li>2. Choose &ldquo;Add to Home Screen&rdquo;</li>
          <li>3. Open Pelikat from your Home Screen and come back here</li>
        </ol>
      )}

      {state.kind === 'ready' && (
        <div className="flex gap-2">
          <button
            onClick={toggle}
            disabled={busy}
            className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 ${
              state.subscribed ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'
            }`}
          >
            {busy ? (
              <LoaderCircle className="size-[16px] animate-spin" />
            ) : state.subscribed ? (
              <BellOff className="size-[16px]" />
            ) : (
              <BellRing className="size-[16px]" />
            )}
            {state.subscribed ? 'Turn off' : 'Turn on'}
          </button>
          {state.subscribed && (
            <button
              onClick={sendTest}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-border text-[13px] font-bold text-foreground active:scale-95 transition-transform disabled:opacity-50"
            >
              Send test
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function describe(state: State): string {
  switch (state.kind) {
    case 'loading':
      return 'Checking this device…'
    case 'ready':
      return state.subscribed
        ? 'On for this device. You’ll get registration, results and organizer updates.'
        : 'Get registration, results and organizer updates on this device, even when the app is closed.'
    case 'ios-needs-install':
      return 'On iPhone and iPad (iOS 16.4+), push notifications work once Pelikat is added to your Home Screen.'
    case 'denied':
      return 'Notifications are blocked for Pelikat. Allow them in your browser or device settings, then reload.'
    case 'no-worker':
      return 'The offline app isn’t active yet. Reload the page, or install Pelikat to your home screen.'
    case 'not-configured':
      return 'Push notifications aren’t set up on this server yet.'
    case 'unsupported':
      return 'This browser doesn’t support push notifications. Try Chrome on Android, or Safari from the Home Screen on iOS.'
  }
}
