import type { Metadata } from 'next'
import { ArrowLeft, Eye, Mail, Megaphone, Smartphone } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BroadcastComposer } from '@/components/notifications/broadcast-composer'

export const metadata: Metadata = {
  title: 'Messages - Pelikat',
  description: 'Send broadcast messages to registered runners',
}

interface BroadcastHistoryRow {
  id: string
  subject: string
  body: string
  send_email: boolean
  send_push: boolean
  recipient_count: number
  created_at: string
  sent_by_email: string | null
  email_sent: number
  email_failed: number
  email_pending: number
  push_sent: number
  push_no_device: number
  read_count: number
}

export default async function OrganizerEventMessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, supabase] = await Promise.all([params, createClient()])

  const { data: event } = await supabase.from('events').select('id, name').eq('id', id).single()
  if (!event) notFound()

  const [{ data: confirmed }, { data: history, error: historyError }] = await Promise.all([
    // Same audience as send_event_broadcast: paid or complimentary registrations
    supabase
      .from('registrations')
      .select('runner_id, guest_email')
      .eq('event_id', id)
      .in('payment_status', ['paid', 'waived']),
    supabase.rpc('get_event_broadcasts', { p_event_id: id }),
  ])

  const accountCount = (confirmed ?? []).filter((r) => r.runner_id).length
  const recipientCount = accountCount + (confirmed ?? []).filter((r) => !r.runner_id && r.guest_email).length
  const broadcasts = (history ?? []) as BroadcastHistoryRow[]

  return (
    <div className="space-y-6 px-4 sm:px-6 py-6">
      <div>
        <Link
          href={`/organizer/events/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to event
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        <p className="text-muted-foreground">Broadcast updates to runners registered for {event.name}</p>
      </div>

      <BroadcastComposer
        eventId={id}
        eventName={event.name}
        recipientCount={recipientCount}
        accountCount={accountCount}
      />

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" /> Sent messages
          </CardTitle>
          <CardDescription>Delivery updates within a minute of sending</CardDescription>
        </CardHeader>
        <CardContent>
          {historyError ? (
            <p className="text-sm text-destructive">Could not load message history: {historyError.message}</p>
          ) : broadcasts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No messages sent for this event yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {broadcasts.map((b) => {
                const emailTarget = Number(b.email_sent) + Number(b.email_failed) + Number(b.email_pending)
                return (
                  <li key={b.id} className="py-4 first:pt-0 last:pb-0">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{b.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(b.created_at).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })}
                            {b.sent_by_email ? ` · ${b.sent_by_email}` : ''} · {b.recipient_count} recipients
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 shrink-0">
                          {b.send_email && (
                            <Badge variant="outline" className="gap-1">
                              <Mail className="h-3 w-3" />
                              {b.email_sent}/{emailTarget} emailed
                              {Number(b.email_failed) > 0 && <span className="text-destructive"> · {b.email_failed} failed</span>}
                            </Badge>
                          )}
                          {b.send_push && (
                            <Badge variant="outline" className="gap-1">
                              <Smartphone className="h-3 w-3" />
                              {b.push_sent} pushed
                            </Badge>
                          )}
                          <Badge variant="outline" className="gap-1">
                            <Eye className="h-3 w-3" />
                            {b.read_count} read in app
                          </Badge>
                        </div>
                      </summary>
                      <p className="mt-3 whitespace-pre-line rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{b.body}</p>
                    </details>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
