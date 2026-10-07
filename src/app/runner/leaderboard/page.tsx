import { createClient } from '@/lib/supabase/server'
import { LiveLeaderboard, type LeaderboardEntry } from '@/components/gamification/live-leaderboard'
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
      .select('id, name, results_published')
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


  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-[#e5e1e4] leading-tight">
              Leaderboard
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto pb-24">
        
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-[#23232b] border border-[#353437] rounded-full flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[32px] text-[#e3c45b]">trophy</span>
          </div>
          <h2 className="text-[20px] font-bold text-[#e5e1e4] tracking-tight">Global Rankings</h2>
          <p className="text-[13px] text-[#958ea0] mt-1">Virtual run rankings by total distance</p>
        </div>

        <div className="flex flex-col gap-3 p-3 bg-[#1c1b1d] rounded-2xl border border-[#353437]/60">
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
          <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-10 flex flex-col items-center text-center gap-3">
            <span className="material-symbols-outlined text-[40px] text-[#e3c45b]">hourglass_top</span>
            <div>
              <h2 className="text-[16px] font-bold text-[#e5e1e4] mb-1">Results coming soon. Stay tuned!</h2>
              <p className="text-[13px] text-[#958ea0]">
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
          />
        )}

      </div>
    </div>
  )
}
