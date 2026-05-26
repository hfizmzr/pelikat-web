import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

  const badgeDefinitions: Record<string, { name: string; description: string; icon: string }> = {
    first_run: { name: 'First Run', description: 'Completed your first virtual run', icon: '🏃' },
    '5k_club': { name: '5K Club', description: 'Ran a total of 5 kilometers', icon: '🎯' },
    '10k_club': { name: '10K Club', description: 'Ran a total of 10 kilometers', icon: '🏆' },
    'marathon_club': { name: 'Marathon Club', description: 'Ran a total of 42.195 kilometers', icon: '🌟' },
    event_complete: { name: 'Event Finisher', description: 'Completed a race event', icon: '🏅' },
    early_bird: { name: 'Early Bird', description: 'Registered early for an event', icon: '🐦' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Badges</h1>
        <p className="text-muted-foreground">Your achievements and milestones</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {badges?.map((badge) => {
          const def = badgeDefinitions[badge.badge_key] || {
            name: badge.badge_key.replace('_', ' '),
            description: 'Achievement badge',
            icon: '🏆',
          }

          return (
            <Card key={badge.id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-2xl">
                    {def.icon}
                  </div>
                  <div>
                    <CardTitle className="text-lg capitalize">{def.name}</CardTitle>
                    <CardDescription className="text-xs">{def.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{badge.events?.name}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(badge.awarded_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {(!badges || badges.length === 0) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-muted-foreground mb-2">No badges yet</p>
            <p className="text-sm text-muted-foreground">Complete events and log runs to earn badges!</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}