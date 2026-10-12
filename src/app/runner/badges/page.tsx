import type { LucideIcon } from "lucide-react"
import { AlarmClock, ArrowLeft, Award, BadgeCheck, Flame, Frown, Medal, Star, Trophy } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BadgeCertificateButton } from '@/components/gamification/certificate-download'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Badges - Pelikat',
  description: 'Your achievements and milestones',
}

const badgeDefinitions: Record<string, { name: string; description: string; icon: LucideIcon; color: string }> = {
  first_run: { name: 'First Run', description: 'Completed your first virtual run', icon: Flame, color: '#ef4444' },
  '5k_club': { name: '5K Club', description: 'Ran a total of 5 kilometers', icon: Star, color: '#22c55e' },
  '10k_club': { name: '10K Club', description: 'Ran a total of 10 kilometers', icon: Award, color: '#0f9b9b' },
  'marathon_club': { name: 'Marathon Club', description: 'Ran a total of 42.195 kilometers', icon: Medal, color: '#0ea5e9' },
  event_complete: { name: 'Event Finisher', description: 'Completed a race event', icon: BadgeCheck, color: '#0f9b9b' },
  early_bird: { name: 'Early Bird', description: 'Registered early for an event', icon: AlarmClock, color: '#0ea5e9' },
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
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <span className="size-[24px]"><ArrowLeft className="size-[24px]" /></span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-foreground leading-tight">
              Badges
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-4 max-w-sm w-full mx-auto">
        <div className="flex flex-col items-center text-center mb-2">
          <div className="w-20 h-20 bg-gradient-to-tr from-primary-foreground to-primary rounded-full flex items-center justify-center mb-4 border-4 border-background ">
            <span className="size-[40px] text-foreground"><Medal className="size-[40px] text-foreground" /></span>
          </div>
          <h2 className="text-[20px] font-bold text-foreground tracking-tight">Trophy Case</h2>
          <p className="text-[13px] text-muted-foreground">Your achievements and milestones</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          {badges?.map((badge) => {
            const def = badgeDefinitions[badge.badge_key] || {
              name: badge.badge_key.replace('_', ' '),
              description: 'Achievement badge',
              icon: Trophy,
              color: '#0f9b9b'
            }

            return (
              <div key={badge.id} className="flex flex-col p-4 bg-card rounded-2xl border border-border/60 active:scale-[0.98] transition-transform">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${def.color}15`, color: def.color, border: `1px solid ${def.color}30` }}
                >
                  <def.icon className="size-[24px]" />
                </div>
                
                <h3 className="text-[14px] font-bold text-foreground capitalize mb-1 leading-tight">{def.name}</h3>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3">{def.description}</p>
                
                <div className="mt-auto flex flex-col gap-1.5">
                  {badge.events?.name && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-accent text-muted-foreground w-fit truncate max-w-full">
                      {badge.events.name}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
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
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-card border border-border/40 mt-4">
            <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-4">
              <span className="size-[32px] text-muted-foreground"><Frown className="size-[32px] text-muted-foreground" /></span>
            </div>
            <p className="text-[16px] font-bold text-foreground mb-2">No badges yet</p>
            <p className="text-[13px] text-muted-foreground">
              Complete events and log runs to earn badges!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}