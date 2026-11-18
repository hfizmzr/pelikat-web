import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusTag } from '@/components/ui/status-tag'
import { Calendar, MapPin, Users, Clock, ArrowLeft, Shirt, BarChart3, ClipboardList, Megaphone } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EventSettingsPanel } from '@/components/events/event-settings-panel'
import { CopyPublicEventLink } from '@/components/events/copy-public-link-button'
import { EventPageTabs } from '@/components/events/event-tabs'
import { ThemeEditor } from '@/components/theme/theme-editor'
import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
import type { ThemeTokens } from '@/lib/theme/types'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Event details - Pelikat',
  description: 'Manage event details and registrations',
}

type RaceCategory = {
  id: string
  name: string | null
  gender: string | null
  min_age: number | null
  max_age: number | null
  price: number | null
  max_slots: number | null
}

type Registration = {
  id: string
  bib_number: string | null
  checked_in: boolean | null
  payment_status: string | null
  runner_profiles: { full_name: string | null } | null
  race_categories: { name: string | null; price: number | null } | null
}

type EventStatus = 'draft' | 'published' | 'closed'

// Same shape the ids take in Postgres (uuid) — used to guard the `.or` filter
// below against a hand-craftable theme_preset_id.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

type EventDetail = {
  id: string
  name: string
  description: string | null
  event_date: string
  location: string | null
  status: EventStatus
  reg_open: string | null
  reg_close: string | null
  results_published: boolean | null
  organizer_id: string | null
  theme_preset_id: string | null
  theme_config: unknown
  /** Public-page slug (077 trigger auto-derives for published/closed); drafts
   * may be NULL — the copy-link button is hidden then (P3 Task 5). */
  slug: string | null
  race_categories: RaceCategory[] | null
  registrations: Registration[] | null
}

export default async function OrganizerEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const { data: event } = await supabase
    .from('events')
    .select(`
      *,
      race_categories(*),
      registrations(*, race_categories(*))
    `)
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  // Re-attach runner names via the organizer-safe view (raw
  // runner_profiles rows / embeds are no longer organizer-readable).
  const profileById = await getSafeRunnerProfiles(
    supabase,
    ((event.registrations ?? []) as { runner_id?: string | null }[]).map(reg => reg.runner_id)
  )
  const eventWithProfiles = {
    ...event,
    registrations: ((event.registrations ?? []) as unknown as { runner_id?: string | null }[]).map((reg) => ({
      ...reg,
      runner_profiles: profileById.get((reg as { runner_id?: string }).runner_id ?? '') ?? null,
    })),
  }

  const eventDetail = eventWithProfiles as EventDetail
  const raceCategories = eventDetail.race_categories ?? []
  const registrations = eventDetail.registrations ?? []

  // Theme tab inputs: system preset gallery (public read per 076 RLS) and
  // caller ownership (read-only tab for non-owners — spec §8.6).
  const [{ data: presets }, { data: { user } }] = await Promise.all([
    supabase
      .from('theme_presets')
      .select('id, name, tokens, is_active')
      .eq('kind', 'system')
      // Task 8: the gallery shows ACTIVE presets only — deactivation hides the
      // card + blocks (re)selection; resolve.ts is unchanged so already-themed
      // events keep rendering (@manager ruling, formerly ruling #10).
      // CodeRabbit fix: ALSO include the preset the CURRENT event references,
      // even when deactivated — otherwise theme_config.presetId resolves to
      // null in the editor (preview diverges from the engine, colors empty).
      // The save-side is_active rejection stays unchanged (fail-closed).
      // Guarded to a syntactically-valid uuid so an odd stored id can't build
      // a malformed `.or` filter.
      .or(
        UUID_RE.test(eventDetail.theme_preset_id ?? '')
          ? `is_active.eq.true,id.eq.${eventDetail.theme_preset_id}`
          : 'is_active.eq.true',
      )
      .order('name'),
    supabase.auth.getUser(),
  ])
  const myOrganizerId = user?.app_metadata?.organizer_id
  const canEdit = typeof myOrganizerId === 'string' && eventDetail.organizer_id === myOrganizerId

  // Amounts actually charged: the payments ledger (migration 059) stores the
  // checkout-time amount per registration (order_type='registration',
  // status='completed' once HitPay confirms). Paid registrations without a
  // ledger row (mock-payment flow flips payment_status directly) fall back to
  // the category's current price. Waived registrations are never charged, so
  // they are excluded from revenue entirely.
  const registrationIds = registrations.map((registration) => registration.id)
  const amountByRegistration = new Map<string, number>()
  if (registrationIds.length > 0) {
    const { data: completedPayments } = await supabase
      .from('payments')
      .select('registration_id, amount')
      .eq('order_type', 'registration')
      .eq('status', 'completed')
      .in('registration_id', registrationIds)
    for (const payment of completedPayments ?? []) {
      const p = payment as { registration_id: string | null; amount: number | null }
      if (p.registration_id) amountByRegistration.set(p.registration_id, Number(p.amount ?? 0))
    }
  }

  const stats = {
    totalRegistrations: registrations.length,
    checkedIn: registrations.filter((registration) => registration.checked_in).length,
    categories: raceCategories.length,
    // Revenue = amounts actually collected from PAID registrations only
    // (ledger amount where recorded, category price otherwise). Waived
    // registrations are complimentary — no charge, no revenue.
    revenue: registrations
      .filter((registration) => registration.payment_status === 'paid')
      .reduce(
        (sum, registration) =>
          sum + (amountByRegistration.get(registration.id) ?? Number(registration.race_categories?.price ?? 0)),
        0,
      ),
  }

  // Public app origin for the shareable /events/{slug} URL (P3 Task 5) —
  // same fallback chain as hitpayRedirectUrl (tunnel in dev, APP_URL in prod).
  const appUrl =
    process.env.NEXT_PUBLIC_TUNNEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  return (
    // px gutters (post-P4 audit finding #2): stat cards + tab panels were
    // flush to the viewport at mobile — sibling organizer pages wrap in px-6.
    <div className="space-y-6 px-4 sm:px-6 py-6">
      {/* Header wrap (audit #1/#4): the actions row overflowed the 390px
      viewport (Settings clipped, Copy/Analytics off-canvas) — stack under
      sm so every action is reachable; title column needs min-w-0 or the
      flex min-width floor collapses it to one word per line. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Link href="/organizer/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 flex-1 text-[28px] leading-9 font-medium">{eventDetail.name}</h1>
            <StatusTag status={eventDetail.status} />
          </div>
          <p className="text-[14px] text-muted-foreground flex items-center gap-2 mt-1 min-w-0 truncate">
            <Calendar className="size-4 shrink-0" strokeWidth={1.75} />
            {new Date(eventDetail.event_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            {eventDetail.location && (
              <>
                <MapPin className="size-4 ml-2 shrink-0" strokeWidth={1.75} />
                {eventDetail.location}
              </>
            )}
          </p>
        </div>

        {/* Settings panel — client component with delete + status update */}
        <EventSettingsPanel
          eventId={eventDetail.id}
          currentStatus={eventDetail.status}
          eventName={eventDetail.name}
          regOpen={eventDetail.reg_open}
          regClose={eventDetail.reg_close}
          resultsPublished={eventDetail.results_published ?? false}
        />
        {/* Copy Public Event Link (P3 Task 5): the shareable /events/[slug]
        page is public for published+closed events (082); the slug is only
        guaranteed there (auto-derived for published/closed; drafts may be
        NULL). Also gated on status: published-then-drafted events KEEP their
        slug (077 trigger does not clear it), but 082 still denies drafts — the
        copied URL would 404. */}
        {eventDetail.slug && eventDetail.status !== 'draft' && (
          <CopyPublicEventLink
            url={`${appUrl}/events/${eventDetail.slug}`}
          />
        )}
        <Link href={`/organizer/events/${eventDetail.id}/analytics`}>
          <Button variant="outline">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-normal text-muted-foreground">Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[28px] leading-none font-medium tabular-nums">{stats.totalRegistrations}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-normal text-muted-foreground">Checked in</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[28px] leading-none font-medium tabular-nums">{stats.checkedIn}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-normal text-muted-foreground">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[28px] leading-none font-medium tabular-nums">{stats.categories}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-normal text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[28px] leading-none font-medium tabular-nums">RM {stats.revenue.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
      </div>

      <EventPageTabs
        overview={
          <>
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Event description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {eventDetail.description || 'No description provided'}
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border">
                <CardHeader>
                  <CardTitle>Quick actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/organizer/events/${eventDetail.id}/registrations`}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Registrations and guests
                    </Link>
                  </Button>
                  <Link href={`/organizer/events/${eventDetail.id}/checkin`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Users className="mr-2 h-4 w-4" />
                      Check-in dashboard
                    </Button>
                  </Link>
                  <Link href={`/organizer/events/${eventDetail.id}/repc`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Shirt className="mr-2 h-4 w-4" />
                      REPC inventory
                    </Button>
                  </Link>
                  <Link href={`/organizer/events/${eventDetail.id}/photos`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Clock className="mr-2 h-4 w-4" />
                      Photo management
                    </Button>
                  </Link>
                  <Link href={`/organizer/events/${eventDetail.id}/leaderboard`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Users className="mr-2 h-4 w-4" />
                      Leaderboard
                    </Button>
                  </Link>
                  <Link href={`/organizer/events/${eventDetail.id}/messages`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Megaphone className="mr-2 h-4 w-4" />
                      Messages to runners
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle>Race categories</CardTitle>
                </CardHeader>
                <CardContent>
                  {raceCategories.length > 0 ? (
                    <div className="space-y-2">
                      {raceCategories.map((cat) => (
                        <div key={cat.id} className="flex items-center justify-between">
                          <span className="text-sm">{cat.name}</span>
                          <span className="text-[12px] text-muted-foreground">{cat.gender || "Open"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-3">No categories yet</p>
                      <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                        <Button size="sm" variant="outline">Manage categories</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        }
        registrations={
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Registrations</CardTitle>
              <CardDescription>All runner registrations for this event</CardDescription>
            </CardHeader>
            <CardContent>
              {registrations.length > 0 ? (
                <div className="space-y-4">
                  {registrations.slice(0, 10).map((reg) => (
                    <div key={reg.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="font-medium">{reg.runner_profiles?.full_name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-mono">{reg.bib_number || 'No bib yet'}</span> · {reg.race_categories?.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusTag tone={reg.checked_in ? 'success' : 'neutral'}>
                          {reg.checked_in ? 'Checked in' : 'Not checked in'}
                        </StatusTag>
                        <StatusTag status={reg.payment_status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No registrations yet</p>
              )}
            </CardContent>
          </Card>
        }
        categories={
          <Card className="border-border">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Race categories</CardTitle>
                <CardDescription>Manage race categories for this event</CardDescription>
              </div>
              <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                <Button size="sm" variant="outline">Manage all</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {raceCategories.length > 0 ? (
                <div className="space-y-4">
                  {raceCategories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <p className="font-medium">{cat.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {cat.gender ?? 'Open'} · ages {cat.min_age} to {cat.max_age}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] tabular-nums text-foreground">RM {Number(cat.price).toFixed(2)}</span>
                        {cat.max_slots && <span className="text-[13px] tabular-nums text-muted-foreground">{cat.max_slots.toLocaleString()} places</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No categories yet</p>
                  <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                    <Button>Add category</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        }
        theme={
          <ThemeEditor
            eventId={eventDetail.id}
            // uploads target organizers/{organizer_id}/... — session-supplied
            // (plan Task 7: never fetched client-side)
            organizerId={typeof myOrganizerId === 'string' ? myOrganizerId : ''}
            canEdit={canEdit}
            savedPresetId={eventDetail.theme_preset_id ?? null}
            // theme_config is hand-craftable JSONB — the editor seeds
            // defensively (non-object shapes degrade to an empty draft).
            savedConfig={(eventDetail.theme_config ?? null) as ThemeTokens | null}
            presets={(presets ?? []).map((preset) => ({
              id: preset.id,
              name: preset.name,
              tokens: preset.tokens as ThemeTokens,
              is_active: preset.is_active as boolean | null,
            }))}
          />
        }
      />
    </div>
  )
}
