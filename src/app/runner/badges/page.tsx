import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BadgeCertificateButton } from '@/components/gamification/certificate-download'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Badges - Pelikat',
  description: 'Your achievements and milestones',
}

const badgeDefinitions: Record<string, { name: string; description: string; icon: string; color: string }> = {
  first_run: { name: 'First Run', description: 'Completed your first virtual run', icon: 'local_fire_department', color: '#ffb4ab' },
  '5k_club': { name: '5K Club', description: 'Ran a total of 5 kilometers', icon: 'stars', color: '#4edea3' },
  '10k_club': { name: '10K Club', description: 'Ran a total of 10 kilometers', icon: 'workspace_premium', color: '#d0bcff' },
  'marathon_club': { name: 'Marathon Club', description: 'Ran a total of 42.195 kilometers', icon: 'military_tech', color: '#4cd7f6' },
  event_complete: { name: 'Event Finisher', description: 'Completed a race event', icon: 'verified', color: '#d0bcff' },
  early_bird: { name: 'Early Bird', description: 'Registered early for an event', icon: 'alarm_on', color: '#4cd7f6' },
}

export default async function RunnerBadgesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: badges } = await supabase
    .from('runner_badges')
    .select('*, events(name)')
    .eq('runner_id', profile?.id)
    .order('awarded_at', { ascending: false })

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
              Badges
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-4 max-w-sm w-full mx-auto">
        <div className="flex flex-col items-center text-center mb-2">
          <div className="w-20 h-20 bg-gradient-to-tr from-[#3c0091] to-[#d0bcff] rounded-full flex items-center justify-center mb-4 border-4 border-[#131315] shadow-[0_0_20px_rgba(208,188,255,0.3)]">
            <span className="material-symbols-outlined text-[40px] text-[#e5e1e4]">military_tech</span>
          </div>
          <h2 className="text-[20px] font-bold text-[#e5e1e4] tracking-tight">Trophy Case</h2>
          <p className="text-[13px] text-[#958ea0]">Your achievements and milestones</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {badges?.map((badge) => {
            const def = badgeDefinitions[badge.badge_key] || {
              name: badge.badge_key.replace('_', ' '),
              description: 'Achievement badge',
              icon: 'emoji_events',
              color: '#d0bcff'
            }

            return (
              <div key={badge.id} className="flex flex-col p-4 bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 active:scale-[0.98] transition-transform">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${def.color}15`, color: def.color, border: `1px solid ${def.color}30` }}
                >
                  <span className="material-symbols-outlined text-[24px]">{def.icon}</span>
                </div>
                
                <h3 className="text-[14px] font-bold text-[#e5e1e4] capitalize mb-1 leading-tight">{def.name}</h3>
                <p className="text-[11px] text-[#958ea0] line-clamp-2 mb-3">{def.description}</p>
                
                <div className="mt-auto flex flex-col gap-1.5">
                  {badge.events?.name && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#353437] text-[#cbc3d7] w-fit truncate max-w-full">
                      {badge.events.name}
                    </span>
                  )}
                  <span className="text-[10px] text-[#958ea0]">
                    {new Date(badge.awarded_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <BadgeCertificateButton
                    badge={{
                      runnerId: badge.runner_id,
                      badgeKey: badge.badge_key,
                      eventId: badge.event_id ?? null,
                      badgeName: def.name,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {(!badges || badges.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-[#1c1b1d] border border-[#353437]/40 mt-4">
            <div className="w-16 h-16 bg-[#201f22] rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px] text-[#958ea0]">sentiment_dissatisfied</span>
            </div>
            <p className="text-[16px] font-bold text-[#e5e1e4] mb-2">No badges yet</p>
            <p className="text-[13px] text-[#958ea0]">
              Complete events and log runs to earn badges!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}