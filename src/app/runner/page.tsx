import type { LucideIcon } from "lucide-react"
import { Award, Bell, CalendarX, CheckCheck, Flame, Footprints, QrCode, ShoppingBag, Tag, Tags, Trophy } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Runner Dashboard - Pelikat',
  description: 'Your runner dashboard with events, badges, and stats',
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: LucideIcon, label: string, value: string | number, sub?: string, color: 'primary' | 'secondary' | 'tertiary' | 'error' }) {
  const colorMap = {
    primary: { bg: 'bg-primary/10', text: 'text-primary' },
    secondary: { bg: 'bg-primary/10', text: 'text-primary' },
    tertiary: { bg: 'bg-success/10', text: 'text-success' },
    error: { bg: 'bg-red-500/10 dark:bg-red-300/10', text: 'text-red-500 dark:text-red-300' },
  }
  const c = colorMap[color]

  return (
    <div className="flex flex-col justify-between p-4 rounded-xl bg-card shadow-sm border border-border/40">
      <div className="flex items-center justify-between">
        <span className={`p-1.5 rounded-lg ${c.bg} ${c.text}`}>
          <Icon className="size-[20px]" />
        </span>
      </div>
      <div className="mt-4">
        <span className="block text-[10px] leading-[14px] tracking-[0.05em] text-muted-foreground font-medium uppercase">
          {label}
        </span>
        <p className="text-[24px] leading-[28px] tracking-[-0.01em] font-bold text-foreground mt-0.5">
          {value}
        </p>
        {sub && (
          <span className="block text-[11px] text-muted-foreground mt-1">{sub}</span>
        )}
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

  const [{ data: registrations }, { data: badges }] = await Promise.all([
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
  ])

  const upcomingEvents = registrations
    ?.filter(r => r.events?.status === 'published' && new Date(r.events.event_date) >= new Date())
    .slice(0, 3) || []

  const nextEvent = upcomingEvents[0]

  const [totalRunDistance, { data: streakData }] = await Promise.all([
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
  ])

  const currentStreak = streakData?.current_streak || 0
  const longestStreak = streakData?.longest_streak || 0

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl px-5 pt-safe">
        <div className="h-16 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[18px] font-bold text-foreground">
                Hi, {profile?.full_name?.split(' ')[0] || 'Runner'}
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[9px] font-bold tracking-wider uppercase">
                Pro
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">Ready for your next run?</p>
          </div>
          <button className="relative w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors">
            <Bell className="size-[22px]" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 dark:bg-red-300 ring-2 ring-background" />
          </button>
        </div>
      </header>

      <div className="flex flex-col px-5 space-y-6 pb-6 mt-2">
        
        {/* Next Event Wallet Pass */}
        {nextEvent ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Next Upcoming Event
              </span>
            </div>
            <div className="relative overflow-hidden rounded-xl bg-card p-5 shadow-md border border-border/60">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                  {new Date(nextEvent.events?.event_date).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <h1 className="text-[20px] leading-[26px] tracking-[-0.015em] text-foreground font-extrabold mb-2">
                  {nextEvent.events?.name}
                </h1>
                <div className="flex items-center gap-4 text-muted-foreground text-[11px]">
                  <span className="inline-flex items-center gap-1.5 bg-card px-2 py-1 rounded-md border border-border">
                    <Tag className="size-[14px] text-primary" />
                    <span className="font-mono">{nextEvent.bib_number || 'TBA'}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Tags className="size-[14px] text-success" />
                    {nextEvent.race_categories?.name}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/40 flex gap-2">
                <Link
                  href={`/runner/events/${nextEvent.events?.id}/bib`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold active:scale-95 transition-transform"
                >
                  <QrCode className="size-[16px]" />
                  Digital BIB Pass
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-xl bg-card p-6 border border-border/40 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center mb-3">
              <CalendarX className="size-[24px] text-muted-foreground" />
            </div>
            <h3 className="text-[14px] font-bold text-foreground mb-1">No Upcoming Events</h3>
            <p className="text-[12px] text-muted-foreground mb-4">Discover your next race and start training.</p>
            <Link href="/runner/events" className="px-5 py-2.5 bg-primary text-primary-foreground text-[12px] font-bold rounded-xl active:scale-95 transition-transform">
              Explore Events
            </Link>
          </section>
        )}

        {/* Quick Links — Leaderboard & Merch */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/runner/leaderboard"
            className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border/40 active:scale-[0.98] transition-transform"
          >
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <Trophy className="size-[18px]" />
            </span>
            <span className="text-[13px] font-semibold text-foreground">Leaderboard</span>
          </Link>
          <Link
            href="/runner/merch"
            className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border/40 active:scale-[0.98] transition-transform"
          >
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <ShoppingBag className="size-[18px]" />
            </span>
            <span className="text-[13px] font-semibold text-foreground">Merch Store</span>
          </Link>
        </div>

        {/* Stats Grid */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-foreground tracking-tight">Your Stats</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Footprints} label="Total Distance" value={`${totalRunDistance.toFixed(1)} km`} color="secondary" />
            <StatCard icon={Flame} label="Current Streak" value={`${currentStreak} days`} sub={`Best: ${longestStreak}`} color="error" />
            <StatCard icon={Award} label="Badges Earned" value={badges?.length || 0} color="primary" />
            <StatCard icon={CheckCheck} label="Races Done" value={registrations?.filter(r => r.events?.status === 'closed').length || 0} color="tertiary" />
          </div>
        </section>

        {/* Recent Badges */}
        {badges && badges.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-bold text-foreground tracking-tight">Recent Achievements</h2>
              <Link href="/runner/badges" className="text-[11px] font-semibold text-primary">View All</Link>
            </div>
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-5 px-5 snap-x hide-scrollbar">
              {badges.map(badge => (
                <div key={badge.id} className="snap-start shrink-0 w-[120px] p-4 bg-card rounded-xl border border-border/40 flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
                    <Award className="size-[24px]" />
                  </div>
                  <span className="text-[11px] font-bold text-foreground leading-tight capitalize">
                    {badge.badge_key.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
        
      </div>
    </div>
  )
}
