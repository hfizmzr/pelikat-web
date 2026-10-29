import { ArrowLeft, Hourglass, Trophy } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import { LiveLeaderboard, type LeaderboardEntry } from '@/components/gamification/live-leaderboard'
import { EventThemeScope } from '@/components/theme/event-theme-scope'
import { scopedLeaderboardEventId } from './scope'
import { LeaderboardFilters } from './filters'
import { ExportCSV } from './export-csv'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Leaderboard - Pelikat',
  description: 'Virtual run rankings across all events',
}

interface SearchParams {
  event_id?: string
  gender?: string
  category_id?: string
}

export default async function RunnerLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [supabase, { event_id, gender, category_id }] = await Promise.all([
    createClient(),
    searchParams,
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const [{ data: events }, { data: categories }] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, results_published, status')
      .order('event_date', { ascending: false }),
    event_id && event_id !== 'all'
      ? supabase
          .from('race_categories')
          .select('id, name')
          .eq('event_id', event_id)
          .order('name')
      : Promise.resolve({ data: [] }),
  ])

  // FR-69: results are hidden until the organizer publishes them
  const publishedIds = (events ?? []).filter((e) => e.results_published).map((e) => e.id)
  const resultsLocked = event_id && event_id !== 'all'
    ? !(events ?? []).some((e) => e.id === event_id && e.results_published)
    : publishedIds.length === 0

  // Theme scope (spec §5.3): only when event_id targets one published event.
  // The events list (already fetched for the filters) is the publication source
  // of truth; the themed row is fetched separately so the mixed view — and the
  // always-run events query — never carries theme_config payload.
  const scopedId = scopedLeaderboardEventId(event_id, events)
  const scopedEvent = scopedId
    ? (
        await supabase
          .from('events')
          .select('id, theme_preset_id, theme_config')
          .eq('id', scopedId)
          .maybeSingle()
      ).data
    : null
  if (scopedId && !scopedEvent) {
    // Fetch failed (RLS/network/no row) — degrade to the neutral scope, but
    // leave a trace instead of swallowing the error silently (Task 12 carry).
    console.warn(`[leaderboard] themed event fetch failed for ${scopedId}`)
  }

  let leaderboard: LeaderboardEntry[] | null = null
  if (!resultsLocked) {
    let query = supabase.from('leaderboard_virtual').select('*').limit(50)

    if (event_id && event_id !== 'all') {
      query = query.eq('event_id', event_id)
    } else if (publishedIds.length > 0) {
      query = query.in('event_id', publishedIds)
    }
    if (gender && gender !== 'all') {
      // view stores M/F; tolerate legacy male/female params
      const g = gender === 'male' ? 'M' : gender === 'female' ? 'F' : gender
      query = query.eq('gender', g)
    }
    if (category_id && category_id !== 'all') {
      query = query.eq('category_id', category_id)
    }

    leaderboard = (await query.order('rank', { ascending: true })).data
  }


  const content = (
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <ArrowLeft className="size-[24px]" />
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-foreground leading-tight">
              Leaderboard
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto pb-24">
        
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-muted border border-border rounded-full flex items-center justify-center mb-3">
            <Trophy className="size-[32px] text-amber-500 dark:text-amber-400" />
          </div>
          <h2 className="text-[20px] font-bold text-foreground tracking-tight">Global Rankings</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Virtual run rankings by total distance</p>
        </div>

        <div className="flex flex-col gap-3 p-3 bg-card rounded-2xl border border-border/60">
          <div className="flex items-center justify-between gap-3">
            <LeaderboardFilters
              events={events ?? []}
              categories={(categories as { id: string; name: string }[]) ?? []}
              showCategories={!!event_id && event_id !== 'all'}
            />
            <ExportCSV
              eventId={event_id}
              gender={gender}
            />
          </div>
        </div>

        {resultsLocked ? (
          <div className="bg-card rounded-2xl border border-border/60 p-10 flex flex-col items-center text-center gap-3">
            <Hourglass className="size-[40px] text-amber-500 dark:text-amber-400" />
            <div>
              <h2 className="text-[16px] font-bold text-foreground mb-1">Results coming soon. Stay tuned!</h2>
              <p className="text-[13px] text-muted-foreground">
                The organizer hasn&apos;t published results for this event yet.
              </p>
            </div>
          </div>
        ) : (
          <LiveLeaderboard
            initialData={leaderboard || []}
            currentRunnerId={profile?.id}
            filters={{
              event_id: event_id && event_id !== 'all' ? event_id : undefined,
              gender: gender && gender !== 'all' ? (gender === 'male' ? 'M' : gender === 'female' ? 'F' : gender) : undefined,
              category_id: category_id && category_id !== 'all' ? category_id : undefined,
            }}
            publishedIds={publishedIds}
          />
        )}

      </div>
    </div>
  )

  // Single published event → themed scope (spec §5.3); mixed views render
  // content unwrapped — same pattern as the runner event page (Task 11).
  return scopedEvent ? (
    <EventThemeScope event={scopedEvent}>{content}</EventThemeScope>
  ) : content
}
