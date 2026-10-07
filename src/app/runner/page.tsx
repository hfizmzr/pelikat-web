import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Runner Dashboard - Pelikat',
  description: 'Your runner dashboard with events, badges, and stats',
}

function StatCard({ icon, label, value, sub, color }: { icon: string, label: string, value: string | number, sub?: string, color: 'primary' | 'secondary' | 'tertiary' | 'error' }) {
  const colorMap = {
    primary: { bg: 'bg-[#d0bcff]/10', text: 'text-[#d0bcff]' },
    secondary: { bg: 'bg-[#4cd7f6]/10', text: 'text-[#4cd7f6]' },
    tertiary: { bg: 'bg-[#4edea3]/10', text: 'text-[#4edea3]' },
    error: { bg: 'bg-[#ffb4ab]/10', text: 'text-[#ffb4ab]' },
  }
  const c = colorMap[color]

  return (
    <div className="flex flex-col justify-between p-4 rounded-xl bg-[#1c1b1d] shadow-sm border border-[#353437]/40">
      <div className="flex items-center justify-between">
        <span className={`p-1.5 rounded-lg ${c.bg} ${c.text}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
      <div className="mt-4">
        <span className="block text-[10px] leading-[14px] tracking-[0.05em] text-[#cbc3d7] font-medium uppercase">
          {label}
        </span>
        <p className="text-[24px] leading-[28px] tracking-[-0.01em] font-bold text-[#e5e1e4] mt-0.5">
          {value}
        </p>
        {sub && (
          <span className="block text-[11px] text-[#958ea0] mt-1">{sub}</span>
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
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl px-5 pt-safe">
        <div className="h-16 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[18px] font-bold text-[#e5e1e4]">
                Hi, {profile?.full_name?.split(' ')[0] || 'Runner'}
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-[#4edea3]/10 text-[#4edea3] text-[9px] font-bold tracking-wider uppercase">
                Pro
              </span>
            </div>
            <p className="text-[11px] text-[#958ea0]">Ready for your next run?</p>
          </div>
          <button className="relative w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] hover:text-[#e5e1e4] transition-colors">
            <span className="material-symbols-outlined text-[22px]">notifications</span>
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[#ffb4ab] ring-2 ring-[#131315]" />
          </button>
        </div>
      </header>

      <div className="flex flex-col px-5 space-y-6 pb-6 mt-2">
        
        {/* Next Event Wallet Pass */}
        {nextEvent ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#cbc3d7]">
                Next Upcoming Event
              </span>
            </div>
            <div className="relative overflow-hidden rounded-xl bg-[#1c1b1d] p-5 shadow-md border border-[#353437]/60">
              <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-[#4cd7f6]/10 blur-2xl pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[#4cd7f6] font-semibold">
                  {new Date(nextEvent.events?.event_date).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <h1 className="text-[20px] leading-[26px] tracking-[-0.015em] text-[#e5e1e4] font-extrabold mb-2">
                  {nextEvent.events?.name}
                </h1>
                <div className="flex items-center gap-4 text-[#cbc3d7] text-[11px]">
                  <span className="inline-flex items-center gap-1.5 bg-[#201f22] px-2 py-1 rounded-md border border-[#353437]">
                    <span className="material-symbols-outlined text-[14px] text-[#d0bcff]">tag</span>
                    <span className="font-mono">{nextEvent.bib_number || 'TBA'}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-[#4edea3]">category</span>
                    {nextEvent.race_categories?.name}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[#353437]/40 flex gap-2">
                <Link
                  href={`/runner/events/${nextEvent.events?.id}/bib`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold active:scale-95 transition-transform"
                >
                  <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
                  Digital BIB Pass
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-xl bg-[#1c1b1d] p-6 border border-[#353437]/40 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-[#201f22] rounded-full flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[24px] text-[#958ea0]">event_busy</span>
            </div>
            <h3 className="text-[14px] font-bold text-[#e5e1e4] mb-1">No Upcoming Events</h3>
            <p className="text-[12px] text-[#958ea0] mb-4">Discover your next race and start training.</p>
            <Link href="/runner/events" className="px-5 py-2.5 bg-[#d0bcff] text-[#3c0091] text-[12px] font-bold rounded-xl active:scale-95 transition-transform">
              Explore Events
            </Link>
          </section>
        )}

        {/* Stats Grid */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-[#e5e1e4] tracking-tight">Your Stats</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="directions_run" label="Total Distance" value={`${totalRunDistance.toFixed(1)} km`} color="secondary" />
            <StatCard icon="local_fire_department" label="Current Streak" value={`${currentStreak} days`} sub={`Best: ${longestStreak}`} color="error" />
            <StatCard icon="workspace_premium" label="Badges Earned" value={badges?.length || 0} color="primary" />
            <StatCard icon="done_all" label="Races Done" value={registrations?.filter(r => r.events?.status === 'closed').length || 0} color="tertiary" />
          </div>
        </section>

        {/* Recent Badges */}
        {badges && badges.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-bold text-[#e5e1e4] tracking-tight">Recent Achievements</h2>
              <Link href="/runner/badges" className="text-[11px] font-semibold text-[#d0bcff]">View All</Link>
            </div>
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-5 px-5 snap-x hide-scrollbar">
              {badges.map(badge => (
                <div key={badge.id} className="snap-start shrink-0 w-[120px] p-4 bg-[#1c1b1d] rounded-xl border border-[#353437]/40 flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-[#4cd7f6]/10 text-[#4cd7f6] rounded-full flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-[24px]">workspace_premium</span>
                  </div>
                  <span className="text-[11px] font-bold text-[#e5e1e4] leading-tight capitalize">
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
