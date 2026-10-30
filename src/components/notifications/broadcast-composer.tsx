'use client'

import { Bell, LoaderCircle, Mail, Send, Smartphone } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { sendEventBroadcast } from '@/lib/actions/notifications'
// Same renderer the dispatch-notifications edge function sends with
import { renderEmail } from '../../../supabase/functions/_shared/notification-templates'

const SUBJECT_MAX = 120
const BODY_MAX = 2000

interface BroadcastComposerProps {
  eventId: string
  eventName: string
  recipientCount: number
  accountCount: number
}

export function BroadcastComposer({ eventId, eventName, recipientCount, accountCount }: BroadcastComposerProps) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [sendPush, setSendPush] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const trimmedSubject = subject.trim()
  const trimmedBody = body.trim()
  const guestCount = recipientCount - accountCount
  // Guests have no app account, so with Email off nothing can reach them
  // (send_event_broadcast skips them too).
  const audience = sendEmail ? recipientCount : accountCount
  const canSend = trimmedSubject.length > 0 && trimmedBody.length > 0 && audience > 0 && !isPending

  const preview = useMemo(
    () =>
      renderEmail(
        {
          id: 'preview',
          kind: 'broadcast',
          title: trimmedSubject || 'Your subject line',
          body: trimmedBody || 'Your message to runners appears here.',
          url: `/runner/events/${eventId}`,
          event_id: eventId,
          data: { event_name: eventName, runner_name: 'Runner' },
        },
        process.env.NEXT_PUBLIC_APP_URL || 'https://pelikat.com'
      ),
    [trimmedSubject, trimmedBody, eventId, eventName]
  )

  const send = () => {
    startTransition(async () => {
      const result = await sendEventBroadcast({ eventId, subject, body, sendEmail, sendPush })
      setConfirmOpen(false)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Message queued for ${result.recipients} runner${result.recipients === 1 ? '' : 's'}`)
      setSubject('')
      setBody('')
    })
  }

  const channels = ['in-app inbox', sendPush && 'push notification', sendEmail && 'email'].filter(Boolean).join(', ')

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Compose message</CardTitle>
          <CardDescription>
            Goes to {audience} confirmed runner{audience === 1 ? '' : 's'}
            {guestCount > 0 &&
              (sendEmail
                ? ` (${guestCount} guest${guestCount === 1 ? '' : 's'} by email only)`
                : ` (${guestCount} guest${guestCount === 1 ? '' : 's'} skipped: guests can only get email)`)}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="broadcast-subject">Subject</Label>
              <span className="text-xs text-muted-foreground">{subject.length}/{SUBJECT_MAX}</span>
            </div>
            <Input
              id="broadcast-subject"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Race-kit collection moved to Hall B"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="broadcast-body">Message</Label>
              <span className="text-xs text-muted-foreground">{body.length}/{BODY_MAX}</span>
            </div>
            <Textarea
              id="broadcast-body"
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Write your update. Leave a blank line between paragraphs."
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Channels</p>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" /> Email
              </span>
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} aria-label="Send email" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm">
                <Smartphone className="h-4 w-4 text-muted-foreground" /> Push notification
              </span>
              <Switch checked={sendPush} onCheckedChange={setSendPush} aria-label="Send push notification" />
            </div>
            <p className="text-xs text-muted-foreground">
              Every message also lands in the runner&apos;s in-app inbox. Push reaches runners who turned it on in the app.
            </p>
          </div>

          <Button className="w-full" disabled={!canSend} onClick={() => setConfirmOpen(true)}>
            <Send className="mr-2 h-4 w-4" />
            Send to {audience} runner{audience === 1 ? '' : 's'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>What runners will receive</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="email">
            <TabsList>
              <TabsTrigger value="email">
                <Mail className="mr-1.5 h-4 w-4" /> Email
              </TabsTrigger>
              <TabsTrigger value="push">
                <Bell className="mr-1.5 h-4 w-4" /> Push
              </TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground truncate">
                <span className="font-medium text-foreground">Subject:</span> {preview?.subject}
              </p>
              <iframe
                title="Email preview"
                srcDoc={preview?.html}
                sandbox=""
                className="w-full h-[520px] rounded-lg border border-border bg-white"
              />
            </TabsContent>
            <TabsContent value="push" className="mt-4">
              <div className="mx-auto max-w-sm rounded-2xl bg-muted/60 p-3 shadow-sm border border-border">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/icon-192.png" alt="" className="h-4 w-4 rounded" />
                  PELIKAT · now
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground">{trimmedSubject || 'Your subject line'}</p>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {trimmedBody || 'Your message to runners appears here.'}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !isPending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {audience} runner{audience === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{trimmedSubject}&rdquo; will be delivered by {channels}. Sent messages can&apos;t be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault()
                send()
              }}
            >
              {isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
