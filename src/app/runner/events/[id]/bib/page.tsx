import { StatusTag } from '@/components/ui/status-tag'
import { ArrowLeft, Users } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchDjangoApi } from '@/lib/django'
import { BibActionButtons } from '@/components/events/bib-action-buttons'
import { RaceDayScheduleCard } from '@/components/runner/race-day-schedule-card'
import { EventThemeScope } from '@/components/theme/event-theme-scope'
import { getSurfaceTheme } from '@/lib/theme/surface'
import { resolveLabels } from '@/lib/theme/labels'
import type { Metadata } from 'next'

/** Static fallback entry — the default title when the event row is
 * inaccessible (unauthenticated and/or hidden draft). */
const FALLBACK_TITLE = 'Digital BIB - Pelikat'

/** Simple inline generateMetadata (Task 4 keep-it-trivial ruling): title from
 * the fetched event name + its themed bib label. Reads the event row again
 * through the anon client (Next's standard separate-metadata fetch); a hidden
 * or failed read degrades to the static title — no service-role here. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const supabase = await createClient()
    const { data: event } = await supabase
      .from('events')
      .select('id, name, theme_preset_id, theme_config')
      .eq('id', id)
      .maybeSingle()
    if (!event) return { title: FALLBACK_TITLE }
    const themedLabels = (await getSurfaceTheme(event, supabase))?.labels ?? null
    const bibLabel = (themedLabels ?? resolveLabels(null)).bib_label
    return { title: `${event.name} - ${bibLabel} - Pelikat` }
  } catch {
    return { title: FALLBACK_TITLE }
  }
}

export default async function RunnerBibPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id, full_name')
    .eq('user_id', user?.id)
    .single()

  const [{ data: registration }, { data: event }] = await Promise.all([
    supabase
      .from('registrations')
      .select('*, events(*), race_categories(*)')
      .eq('event_id', id)
      .eq('runner_id', profile?.id)
      .single(),
    supabase
      .from('events')
      .select('id, name, event_date, location, start_time, flag_off_time, cutoff_time, theme_preset_id, theme_config')
      .eq('id', id)
      .single(),
  ])

  if (!registration || !event) {
    notFound()
  }

  // P3 Task 3/4 contract: text labels resolve explicitly here (the scope below
  // is CSS-vars-only); labels null → resolveLabels(null) = the full platform
  // fallback map. Double-resolve with EventThemeScope is the accepted P3 data
  // flow for server components.
  const themedLabels = (await getSurfaceTheme(event, supabase))?.labels ?? null
  const labels = themedLabels ?? resolveLabels(null)

  const isCheckedIn = Boolean(registration.checked_in)
  const checkedInAt = isCheckedIn && registration.checked_in_at
    ? new Date(registration.checked_in_at).toLocaleString()
    : null

  let qrSvg: string | null = null
  let qrError: string | null = null

  try {
    const response = await fetchDjangoApi('/ai/qr/sign', {
      method: 'POST',
      body: JSON.stringify({
        runner_id: profile?.id,
        event_id: id,
        bib_number: registration.bib_number,
      }),
    })

    const qrPayload = typeof response.qr_payload === 'string' ? response.qr_payload : null
    if (!qrPayload) {
      qrError = 'Secure QR code could not be generated.'
    } else {
      qrSvg = await QRCode.toString(qrPayload, {
        type: 'svg',
        width: 220,
        margin: 1,
        color: { dark: isCheckedIn ? '#16a34a' : '#0f172a', light: '#ffffff' },
      })
    }
  } catch {
    qrError = 'Secure QR service is unavailable.'
  }

  return (
    // P3 Task 4: the bib pass joins the themed surfaces — scope carries the
    // --et-* vars/fonts (CSS-vars-only; unthemed events render children
    // unwrapped, zero DOM change).
    <EventThemeScope event={event}>
      <div className="flex flex-col w-full min-h-full bg-background">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border">
          <div className="flex items-center h-14 px-4 pt-safe">
            <Link href={`/runner/events/${id}`} className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
              <ArrowLeft className="size-[24px]" />
            </Link>
            <h1 className="flex-1 text-[16px] font-medium text-foreground text-center mr-8 truncate">
              {labels.bib_label}
            </h1>
          </div>
        </header>

        <div className="flex flex-col px-5 py-6 items-center max-w-sm mx-auto w-full gap-4">

          <div className="flex w-full items-center justify-between">
            {isCheckedIn ? (
              <>
                <StatusTag tone="success">Checked in</StatusTag>
                {checkedInAt && <span className="text-[12px] text-muted-foreground">Scanned at {checkedInAt}</span>}
              </>
            ) : (
              <StatusTag tone="primary">Ready to scan at kit collection</StatusTag>
            )}
          </div>

          {/* The bib: Tyvek white with dark ink, the band in the event's own
              primary colour so themed events keep their look. */}
          <div className="relative w-full overflow-hidden rounded-xl bg-[oklch(0.985_0.004_90)] text-[oklch(0.2_0.01_240)] shadow-[0_1px_2px_rgba(0,0,0,0.12),0_16px_32px_-16px_rgba(0,0,0,0.4)]">
            {(['left-2.5 top-2.5', 'right-2.5 top-2.5', 'bottom-2.5 left-2.5', 'bottom-2.5 right-2.5'] as const).map((pos) => (
              <span
                key={pos}
                aria-hidden="true"
                className={`absolute size-1.5 rounded-full bg-[oklch(0.2_0.01_240/0.18)] shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] ${pos}`}
              />
            ))}
            <div className="bg-primary px-6 py-3 text-primary-foreground">
              <p className="truncate text-[14px] font-medium">{event.name}</p>
              <p className="text-[12px] opacity-80">
                {new Date(event.event_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="flex flex-col items-center px-6 pb-6 pt-5 text-center">
              <h2 className="text-[12px] text-[oklch(0.2_0.01_240/0.6)]">{labels.bib_label}</h2>
              <p className="mt-1 font-mono text-[52px] leading-none font-medium tabular-nums">
                {registration.bib_number}
              </p>
              <p className="mt-3 text-[15px] font-medium">{profile?.full_name}</p>
              <p className="text-[13px] text-[oklch(0.2_0.01_240/0.65)]">{registration.race_categories?.name}</p>

              <div className="mt-5 w-full border-t border-dashed border-[oklch(0.2_0.01_240/0.18)] pt-5">
                {qrSvg ? (
                  <div className="mx-auto w-fit rounded-lg bg-white p-2">
                    <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  </div>
                ) : (
                  <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center rounded-lg border border-dashed border-[oklch(0.2_0.01_240/0.25)] px-4 text-center text-[13px] text-[oklch(0.2_0.01_240/0.7)]">
                    {qrError}
                  </div>
                )}
              </div>
            </div>
          </div>

          <BibActionButtons
            bibNumber={registration.bib_number}
            eventName={event.name}
            bibLabel={labels.bib_label}
          />

          <Link
            href={`/runner/events/${id}/bib/consent`}
            className="w-full min-h-11 rounded-[10px] border border-border/60 text-foreground text-[14px] flex items-center justify-center gap-2 active:bg-card transition-colors"
          >
            <Users className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Generate proxy collection code
          </Link>

          <div className="bg-card p-4 rounded-xl border border-border/60 w-full">
            <h3 className="text-[14px] font-medium text-foreground mb-2">On race morning</h3>
            <ol className="text-[13px] text-muted-foreground space-y-1.5 list-decimal list-inside marker:text-muted-foreground">
              <li>Show this QR code at the check-in counter on race day.</li>
              <li>Ensure your screen brightness is turned up.</li>
              <li>Take a screenshot as a backup.</li>
            </ol>
          </div>

          {/* FR-54: same schedule source as the event detail page (migration 092) */}
          <div className="w-full">
            <RaceDayScheduleCard
              startTime={(event.start_time as string | null) ?? null}
              flagOffTime={(event.flag_off_time as string | null) ?? null}
              cutoffTime={(event.cutoff_time as string | null) ?? null}
            />
          </div>

        </div>
      </div>
    </EventThemeScope>
  )
}
