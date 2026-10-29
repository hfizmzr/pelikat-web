/**
 * Public shareable event page (/events/[slug], P3 Task 5). Reads go through
 * the widened anon SELECT policy (082: published OR closed). Drafts are
 * denied HERE regardless of session — the public route never previews a
 * draft (owner edits happen via the organizer dashboard; plan Global
 * Constraints "owner preview path NOT built in P3").
 *
 * The slug lands in a parameterized `.eq` — hostile path segments simply
 * return 0 rows → notFound() (plan review focus #2). The service-role
 * organizer-name fetch happens ONLY after the visibility gate (safe-name.ts
 * contract, plan review focus #4).
 *
 * Explicit column select (review focus #1): the closed-event page must not
 * load — let alone render — protected organizer columns (contact_email, …).
 * Task 6 layers generateMetadata/generateViewport on top; today the page
 * itself only mounts EventThemeScope, which already renders the banner/logo
 * assets through its resolved slots.
 */
import { MapPin, Trophy, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { EventThemeScope } from '@/components/theme/event-theme-scope'
import { fetchOrganizerName } from '@/lib/supabase/safe-name'

export const metadata: Metadata = {
  title: 'Event - Pelikat',
  description: 'View public event details',
}

/** Exactly the anon-readable columns this page renders (no PII). */
type PublicEventRow = {
  id: string
  name: string
  description: string | null
  event_date: string
  location: string | null
  status: string
  event_type: string | null
  target_distance_km: number | null
  reg_open: string | null
  reg_close: string | null
  results_published: boolean | null
  theme_preset_id: string | null
  theme_config: unknown
  slug: string
  organizer_id: string | null
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const [{ slug }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  // Loose validation only: non-empty string. Everything hostile (`..`, NUL,
  // unicode, 300-char noise) dies naturally at the parameterized query
  // returning 0 rows — never at string surgery.
  if (typeof slug !== 'string' || slug.length === 0) {
    notFound()
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, name, description, event_date, location, status, event_type, target_distance_km, reg_open, reg_close, results_published, theme_preset_id, theme_config, slug, organizer_id')
    .eq('slug', slug)
    .maybeSingle()

  // Missing row OR draft → 404 for anon (082 also hides drafts at RLS; the
  // explicit status check pins the app layer against future policy drift).
  if (!event || event.status === 'draft') {
    notFound()
  }

  const publicEvent = event as PublicEventRow

  // Post-visibility only (safe-name contract): the row passed the gate above,
  // so the service-role read can never resolve a draft's organizer name. The
  // organizers RLS has no public SELECT (019), so no anon join — the helper
  // is the only name source. Absent → the line is simply omitted.
  const organizerName = await fetchOrganizerName(publicEvent.organizer_id)

  const eventDate = new Date(publicEvent.event_date)
  const isVirtual = publicEvent.event_type === 'virtual'
  const now = new Date()
  // "Open" = published AND inside the reg window; null bounds stay open.
  const registrationOpen =
    publicEvent.status === 'published' &&
    (publicEvent.reg_open === null || new Date(publicEvent.reg_open) <= now) &&
    (publicEvent.reg_close === null || new Date(publicEvent.reg_close) >= now)

  return (
    <EventThemeScope event={publicEvent} showAssets>
      <div className="flex flex-col w-full min-h-full bg-background">
        <div className="flex flex-col w-full max-w-xl mx-auto px-5 py-6 gap-5">
          {/* Status + name */}
          <div className="flex flex-col gap-2">
            <span className="px-2 py-1 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              {publicEvent.status}
            </span>
            {isVirtual && publicEvent.target_distance_km != null && (
              <span className="px-2 py-1 w-max rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20">
                Virtual Run · {Number(publicEvent.target_distance_km)} km
              </span>
            )}
            <h1 className="text-[24px] font-bold text-foreground leading-tight">
              {publicEvent.name}
            </h1>
          </div>

          {/* Date & Location */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
              <div className="w-12 h-12 bg-accent/50 rounded-xl flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-red-500 dark:text-red-300 uppercase">
                  {eventDate.toLocaleDateString('en-MY', { month: 'short' })}
                </span>
                <span className="text-[16px] font-extrabold text-foreground leading-none">
                  {eventDate.getDate()}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-foreground">
                  {eventDate.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>

            {publicEvent.location && (
              <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border/60">
                <div className="w-12 h-12 bg-accent/50 rounded-xl flex items-center justify-center">
                  <MapPin className="size-[20px] text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[14px] font-bold text-foreground">Event Location</span>
                  <span className="text-[12px] text-muted-foreground">{publicEvent.location}</span>
                </div>
              </div>
            )}
          </section>

          {/* About */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[16px] font-bold text-foreground">About the Race</h3>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {publicEvent.description || 'No description available for this event.'}
            </p>
            {organizerName && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[12px] text-muted-foreground">Organized by:</span>
                <span className="text-[12px] font-bold text-foreground">{organizerName}</span>
              </div>
            )}
          </section>

          {/* Public CTAs */}
          {(publicEvent.results_published || registrationOpen) && (
            <section className="mt-2 pt-5 border-t border-border/60 flex flex-col gap-3">
              {publicEvent.results_published && (
                <Link
                  href={`/runner/leaderboard?event_id=${publicEvent.id}`}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Trophy className="size-[18px]" />
                  View Leaderboard
                </Link>
              )}
              {registrationOpen && (
                <Link
                  href={`/runner/events/${publicEvent.id}`}
                  className="w-full py-3.5 rounded-xl bg-accent text-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <UserPlus className="size-[18px]" />
                  Register for this Event
                </Link>
              )}
            </section>
          )}
        </div>
      </div>
    </EventThemeScope>
  )
}
