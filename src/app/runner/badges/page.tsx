import type { Metadata } from 'next'
import { ArrowLeft, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BADGE_DEFINITIONS } from '@/lib/badges-registry'
import Link from 'next/link'
import { BadgeCertificateButton } from '@/components/gamification/certificate-download'

// Registry lives in lib/badges-registry.ts, mirrored from pelikat-api// BADGE_RULES; unknown keys fall back to the raw badge_key rendering.

export const metadata: Metadata = {
  title: 'Badges - Pelikat',
  description: 'Your achievements and milestones',
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
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href="/runner" className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <ArrowLeft className="size-[24px]" />
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-medium text-foreground leading-tight">
              Badges
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-4 max-w-sm w-full mx-auto">
        {badges && badges.length > 0 && (
          <p className="text-[14px] text-muted-foreground">
            {badges.length} {badges.length === 1 ? 'badge' : 'badges'} earned · each comes with a certificate
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {badges?.map((badge) => {
            const reg = BADGE_DEFINITIONS[badge.badge_key]
            const def = reg
              ? { name: reg.name, description: reg.description, icon: reg.lucideIcon }
              : {
              name: badge.badge_key.replace('_', ' '),
              description: 'Achievement badge',
              icon: Trophy,
            }

            return (
              <div key={badge.id} className="flex flex-col p-4 bg-card rounded-xl border border-border/60">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-foreground ring-1 ring-inset ring-border">
                  <def.icon className="size-5" strokeWidth={1.75} />
                </div>

                <h3 className="text-[15px] font-medium text-foreground mb-1 leading-tight">{def.name}</h3>
                <p className="text-[12px] text-muted-foreground line-clamp-2 mb-3">{def.description}</p>
                
                <div className="mt-auto flex flex-col gap-1.5">
                  {badge.events?.name && (
                    <span className="truncate text-[12px] text-foreground">
                      {badge.events.name}
                    </span>
                  )}
                  <span className="mb-1.5 text-[12px] text-muted-foreground">
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
            <p className="text-[16px] font-medium text-foreground mb-2">No badges yet</p>
            <p className="text-[13px] text-muted-foreground">
              Finish events and log runs to earn badges
            </p>
          </div>
        )}
      </div>
    </div>
  )
}