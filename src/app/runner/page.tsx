import { Award, ChevronRight, ShoppingBag, Trophy } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import { NotificationBell } from '@/components/notifications/notification-bell'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Home - Pelikat',
  description: 'Your runner dashboard with events, badges, and stats',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function StatCard({ label, value, unit, sub }: { label: string, value: string | number, unit?: string, sub?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-2 text-[28px] leading-none font-medium tabular-nums text-foreground">
        {value}
        {unit && <span className="ml-1 text-[15px] font-normal text-muted-foreground">{unit}</span>}
      </p>
      {sub && <p className="mt-2 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

// The next race, drawn as the bib the runner will pin on: Tyvek white with
// dark ink and a teal band, the same in both themes.
function RaceBib({ eventName, date, bib, category }: { eventName: string, date: string, bib: string | null, category?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-[oklch(0.985_0.004_90)] text-[oklch(0.2_0.01_240)] shadow-[0_1px_2px_rgba(0,0,0,0.12),0_12px_24px_-12px_rgba(0,0,0,0.35)]">
      {(['left-2 top-2', 'right-2 top-2', 'bottom-2 left-2', 'bottom-2 right-2'] as const).map((pos) => (
        <span
          key={pos}
          aria-hidden="true"
          className={`absolute size-1.5 rounded-full bg-[oklch(0.2_0.01_240/0.18)] shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)] ${pos}`}
        />
      ))}
      <div className="bg-[oklch(0.45_0.09_195)] px-5 py-2.5 text-white">
        <p className="truncate text-[13px] font-medium">{eventName}</p>
      </div>
      <div className="px-5 pb-5 pt-4 text-center">
        {bib ? (
          <p className="font-mono text-[40px] leading-none font-medium tabular-nums">{bib}</p>
        ) : (
          <p className="py-2 text-[15px] text-[oklch(0.2_0.01_240/0.6)]">Bib number not assigned yet</p>
        )}
        <p className="mt-3 text-[13px] text-[oklch(0.2_0.01_240/0.65)]">
          {[category, date].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  )
}

export default async function RunnerDashboard() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('*')
    .eq('user_id', user?.id)
    .single()

  const [totalRunDistance, { data: streakData }, { data: registrations }, { data: badges }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('run_logs')
      .select('distance_km')
      .eq('runner_id', profile?.id)
      .then(({ data }) => data?.reduce((acc, r) => acc + Number(r.distance_km || 0), 0) || 0),
    supabase
      .from('runner_streaks')
      .select('current_streak, longest_streak')
      .eq('runner_id', profile?.id)
      .single(),
    supabase
      .from('registrations')
      .select('*, events(*), race_categories(*)')
      .eq('runner_id', profile?.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('runner_badges')
      .select('*')
      .eq('runner_id', profile?.id)
      .order('awarded_at', { ascending: false })
      .limit(5),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ])

  const upcomingEvents = registrations
    ?.filter(r => r.events?.status === 'published' && new Date(r.events.event_date) >= new Date())
    .slice(0, 3) || []

  const nextEvent = upcomingEvents[0]

  const currentStreak = streakData?.current_streak || 0
  const longestStreak = streakData?.longest_streak || 0
  const racesDone = registrations?.filter(r => r.events?.status === 'closed').length || 0

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md px-5 pt-safe">
        <div className="h-16 flex items-center justify-between">
          <div>
            <h1 className="text-[20px] leading-7 font-medium text-foreground">Home</h1>
            <p className="text-[13px] text-muted-foreground">
              {upcomingEvents.length > 0 ? `${plural(upcomingEvents.length, 'upcoming race')}` : 'No upcoming races'}
            </p>
          </div>
          {user && <NotificationBell userId={user.id} initialUnread={unreadCount ?? 0} />}
        </div>
      </header>

      <div className="flex flex-col gap-8 px-5 pb-8 pt-4">
        {nextEvent ? (
          <section aria-labelledby="next-race" className="flex flex-col gap-3">
            <h2 id="next-race" className="text-[13px] text-muted-foreground">Next race</h2>
            <RaceBib
              eventName={nextEvent.events?.name}
              date={new Date(nextEvent.events?.event_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              bib={nextEvent.bib_number || null}
              category={nextEvent.race_categories?.name}
            />
            <div className="flex gap-2">
              <Link
                href={`/runner/events/${nextEvent.events?.id}`}
                className="flex flex-1 min-h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-[14px] font-medium text-primary-foreground transition-[transform,opacity] hover:opacity-90 active:scale-[0.98]"
              >
                Event details
              </Link>
              <Link
                href="/runner/merch"
                className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-border/60 bg-card px-4 text-[14px] font-medium text-foreground transition-[transform,background-color] hover:bg-muted active:scale-[0.98]"
              >
                <ShoppingBag className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Merch
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-border/60 bg-card px-5 py-8 text-center">
            <h2 className="text-[15px] font-medium text-foreground">No upcoming races</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Races you register for show up here with your bib</p>
            <Link
              href="/runner/events"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-5 text-[14px] font-medium text-primary-foreground transition-[transform,opacity] hover:opacity-90 active:scale-[0.98]"
            >
              Explore events
            </Link>
          </section>
        )}

        <nav aria-label="Shortcuts" className="overflow-hidden rounded-xl border border-border/60 bg-card">
          {[
            { href: '/runner/leaderboard', icon: Trophy, label: 'Leaderboard' },
            { href: '/runner/merch', icon: ShoppingBag, label: 'Merch store' },
          ].map(({ href, icon: Icon, label }, i) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-12 items-center gap-3 px-4 text-[14px] text-foreground transition-colors hover:bg-muted/60 ${i > 0 ? 'border-t border-border/60' : ''}`}
            >
              <Icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.75} />
            </Link>
          ))}
        </nav>

        <section aria-labelledby="your-stats">
          <h2 id="your-stats" className="mb-3 text-[15px] font-medium text-foreground">Your stats</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total distance" value={totalRunDistance.toFixed(1)} unit="km" />
            <StatCard
              label="Current streak"
              value={currentStreak}
              unit={currentStreak === 1 ? 'day' : 'days'}
              sub={`Best ${plural(longestStreak, 'day')}`}
            />
            <StatCard label="Badges earned" value={badges?.length || 0} />
            <StatCard label="Past races" value={racesDone} />
          </div>
        </section>

        {badges && badges.length > 0 && (
          <section aria-labelledby="recent-badges">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="recent-badges" className="text-[15px] font-medium text-foreground">Recent badges</h2>
              <Link href="/runner/badges" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">View all</Link>
            </div>
            <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 scrollbar-none">
              {badges.map(badge => {
                const name = badge.badge_key.replace(/_/g, ' ')
                return (
                  <div key={badge.id} className="flex w-[120px] shrink-0 snap-start flex-col items-center rounded-xl border border-border/60 bg-card p-4 text-center">
                    <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Award className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-[12px] leading-4 text-foreground">
                      {name.charAt(0).toUpperCase() + name.slice(1)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
