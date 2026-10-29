import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Users, Clock, ArrowLeft, Shirt, BarChart3, ClipboardList } from 'lucide-react'
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
  title: 'Event Details - Pelikat',
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
  race_categories: { name: string | null } | null
}

type EventStatus = 'draft' | 'published' | 'closed'

// Same shape the ids take in Postgres (uuid) — used to guard the `.or` filter
// below against a hand-craftable theme_preset_id.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  published: 'default',
  draft: 'secondary',
  closed: 'outline',
}

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

  const stats = {
    totalRegistrations: registrations.length,
    checkedIn: registrations.filter((registration) => registration.checked_in).length,
    categories: raceCategories.length,
  }

  const statusVariant = STATUS_VARIANTS

  // Public app origin for the shareable /events/{slug} URL (P3 Task 5) —
  // same fallback chain as hitpayRedirectUrl (tunnel in dev, APP_URL in prod).
  const appUrl =
    process.env.NEXT_PUBLIC_TUNNEL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/organizer/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{eventDetail.name}</h1>
            <Badge variant={statusVariant[eventDetail.status] ?? 'secondary'}>
              {eventDetail.status}
            </Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="h-4 w-4" />
            {new Date(eventDetail.event_date).toLocaleDateString()}
            {eventDetail.location && (
              <>
                <MapPin className="h-4 w-4 ml-2" />
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
            <CardTitle className="text-sm font-medium">Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRegistrations}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.checkedIn}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.categories}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0</div>
          </CardContent>
        </Card>
      </div>

      <EventPageTabs
        overview={
          <>
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Event Description</CardTitle>
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
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href={`/organizer/events/${eventDetail.id}/registrations`}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Registrations &amp; Guests
                    </Link>
                  </Button>
                  <Link href={`/organizer/events/${eventDetail.id}/checkin`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Users className="mr-2 h-4 w-4" />
                      Check-in Dashboard
                    </Button>
                  </Link>
                  <Link href={`/organizer/events/${eventDetail.id}/repc`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Shirt className="mr-2 h-4 w-4" />
                      REPC Inventory
                    </Button>
                  </Link>
                  <Link href={`/organizer/events/${eventDetail.id}/photos`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Clock className="mr-2 h-4 w-4" />
                      Photo Management
                    </Button>
                  </Link>
                  <Link href={`/organizer/events/${eventDetail.id}/leaderboard`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Users className="mr-2 h-4 w-4" />
                      Leaderboard
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle>Race Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  {raceCategories.length > 0 ? (
                    <div className="space-y-2">
                      {raceCategories.map((cat) => (
                        <div key={cat.id} className="flex items-center justify-between">
                          <span className="text-sm">{cat.name}</span>
                          <Badge variant="outline">{cat.gender || "Open"}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-3">No categories yet</p>
                      <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                        <Button size="sm" variant="outline">Manage Categories</Button>
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
                          BIB: {reg.bib_number} | {reg.race_categories?.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={reg.checked_in ? 'default' : 'secondary'}>
                          {reg.checked_in ? 'Checked In' : 'Not Checked In'}
                        </Badge>
                        <Badge variant={reg.payment_status === 'paid' ? 'default' : 'outline'}>
                          {reg.payment_status}
                        </Badge>
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
                <CardTitle>Race Categories</CardTitle>
                <CardDescription>Manage race categories for this event</CardDescription>
              </div>
              <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                <Button size="sm" variant="outline">Manage All</Button>
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
                          {cat.gender ?? 'Open'} | Ages {cat.min_age}-{cat.max_age}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">${cat.price}</Badge>
                        {cat.max_slots && <Badge variant="secondary">{cat.max_slots} slots</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No categories yet</p>
                  <Link href={`/organizer/events/${eventDetail.id}/categories`}>
                    <Button>Add Category</Button>
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
