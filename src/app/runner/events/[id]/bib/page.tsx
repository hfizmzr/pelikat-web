import { ArrowLeft, CircleCheck, Info, QrCode, Users } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchDjangoApi } from '@/lib/django'
import { BibActionButtons } from '@/components/events/bib-action-buttons'
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
    const { labels: themedLabels } = await getSurfaceTheme(event, supabase)
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
      .select('id, name, event_date, location, theme_preset_id, theme_config')
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
  const { labels: themedLabels } = await getSurfaceTheme(event, supabase)
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
        <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
          <div className="flex items-center h-14 px-4 pt-safe">
            <Link href={`/runner/events/${id}`} className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
              <ArrowLeft className="size-[24px]" />
            </Link>
            <h1 className="flex-1 text-[16px] font-bold text-foreground text-center mr-8 truncate">
              {labels.bib_label}
            </h1>
          </div>
        </header>

        <div className="flex flex-col px-5 py-8 items-center max-w-sm mx-auto w-full gap-6">

          {/* Ticket Wallet Container */}
          <div className="w-full relative">
            {/* Main Ticket */}
            <div className={`relative overflow-hidden rounded-[2rem] p-6 pt-8 flex flex-col items-center bg-card border shadow-2xl ${
              isCheckedIn ? 'border-success/40' : 'border-border/60'
            }`}>

              {/* Blurry glow */}
              <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none ${
                isCheckedIn ? 'bg-success/10' : 'bg-primary/10'
              }`} />

              <div className="relative z-10 flex flex-col items-center w-full">
                {isCheckedIn ? (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success border border-success/20 mb-4">
                    <CircleCheck className="size-[16px]" />
                    <span className="text-[10px] font-bold tracking-wider uppercase">Checked In</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-4">
                    <QrCode className="size-[16px]" />
                    <span className="text-[10px] font-bold tracking-wider uppercase">Ready for Scan</span>
                  </div>
                )}

                <h2 className="text-[12px] font-bold text-muted-foreground tracking-widest uppercase mb-1">{labels.bib_label.toUpperCase()}</h2>
                <div className="text-[54px] font-mono font-bold text-foreground leading-none mb-6 drop-shadow-md">
                  {registration.bib_number}
                </div>

                <div className="w-full h-px bg-gradient-to-r from-transparent via-accent to-transparent mb-6" />

                <div className="w-full flex justify-center mb-6">
                  {qrSvg ? (
                    <div className="p-3 rounded-2xl bg-white border border-border/40 shadow-sm">
                      <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
                    </div>
                  ) : (
                    <div className="w-[220px] h-[220px] flex items-center justify-center text-center text-red-500 text-[12px] px-4 border border-dashed border-red-500/40 rounded-xl">
                      {qrError}
                    </div>
                  )}
                </div>

                <div className="w-full flex flex-col gap-3 text-center mb-2">
                  <div>
                    <h3 className="text-[16px] font-bold text-foreground leading-tight mb-0.5">{profile?.full_name}</h3>
                    <p className="text-[12px] text-muted-foreground">{registration.race_categories?.name}</p>
                  </div>
                  <div className="w-full h-px bg-accent/40 my-1" />
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-bold text-foreground truncate">{event.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(event.event_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {checkedInAt && (
                      <span className="text-[10px] text-success mt-1">Scanned at {checkedInAt}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cutouts for ticket effect */}
              <div className="absolute top-[65%] -left-3 w-6 h-6 rounded-full bg-background border-r border-border/60" />
              <div className="absolute top-[65%] -right-3 w-6 h-6 rounded-full bg-background border-l border-border/60" />
            </div>
          </div>

          <BibActionButtons
            bibNumber={registration.bib_number}
            eventName={event.name}
            bibLabel={labels.bib_label}
          />

          <Link
            href={`/runner/events/${id}/bib/consent`}
            className="w-full py-3.5 mt-2 rounded-xl border border-border text-muted-foreground text-[13px] font-bold flex items-center justify-center gap-2 active:bg-card transition-colors"
          >
            <Users className="size-[18px]" />
            Generate Proxy Collection Code
          </Link>

          <div className="bg-card p-4 rounded-xl border border-border/40 w-full mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Info className="size-[18px] text-primary" />
              <span className="text-[13px] font-bold text-foreground">Instructions</span>
            </div>
            <ol className="text-[12px] text-muted-foreground space-y-2 list-decimal list-inside marker:text-muted-foreground">
              <li>Show this QR code at the check-in counter on race day.</li>
              <li>Ensure your screen brightness is turned up.</li>
              <li>Take a screenshot as a backup.</li>
            </ol>
          </div>

        </div>
      </div>
    </EventThemeScope>
  )
}
