"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent } from "@/components/ui/card"
import { Award, X } from "lucide-react"

interface BadgeInfo {
  badge_key: string
  name: string
  description: string
  icon: string
}

export function BadgeToast() {
  const { user } = useAuth()
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const [newBadge, setNewBadge] = useState<BadgeInfo | null>(null)
  const [visible, setVisible] = useState(false)
  const profileIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function getProfile() {
      if (!user) return
      const { data } = await supabase
        .from("runner_profiles")
        .select("id")
        .eq("user_id", user.id)
        .single()
      if (data) {
        profileIdRef.current = data.id
      }
    }
    getProfile()
  }, [user, supabase])

  useEffect(() => {
    if (!profileIdRef.current) return

    channelRef.current = supabase
      .channel("badge-toast")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "runner_badges",
          filter: `runner_id=eq.${profileIdRef.current}`,
        },
        async (payload) => {
          const badgeKey = (payload.new as Record<string, string>).badge_key

          const defs: Record<string, BadgeInfo> = {
            first_run: {
              badge_key: "first_run",
              name: "First Run",
              description: "Completed your first virtual run",
              icon: "🏃",
            },
            "5k_distance": {
              badge_key: "5k_distance",
              name: "5K Club",
              description: "Ran a total of 5 kilometers",
              icon: "🎯",
            },
            "10k_distance": {
              badge_key: "10k_distance",
              name: "10K Club",
              description: "Ran a total of 10 kilometers",
              icon: "🏆",
            },
            "21k_distance": {
              badge_key: "21k_distance",
              name: "Half Marathon",
              description: "Ran a total of 21.1 kilometers",
              icon: "🥈",
            },
            "42k_distance": {
              badge_key: "42k_distance",
              name: "Full Marathon",
              description: "Ran a total of 42.2 kilometers",
              icon: "🌟",
            },
            "100k_distance": {
              badge_key: "100k_distance",
              name: "100K Club",
              description: "Ran a total of 100 kilometers",
              icon: "💎",
            },
            "5_runs": {
              badge_key: "5_runs",
              name: "5 Runs",
              description: "Logged 5 virtual runs",
              icon: "🏃‍♂️",
            },
            "10_runs": {
              badge_key: "10_runs",
              name: "10 Runs",
              description: "Logged 10 virtual runs",
              icon: "🏃‍♀️",
            },
            "25_runs": {
              badge_key: "25_runs",
              name: "25 Runs",
              description: "Logged 25 virtual runs",
              icon: "💪",
            },
            "50_runs": {
              badge_key: "50_runs",
              name: "50 Runs",
              description: "Logged 50 virtual runs",
              icon: "🔥",
            },
            streak_3: {
              badge_key: "streak_3",
              name: "3-Day Streak",
              description: "Ran on 3 consecutive days",
              icon: "📅",
            },
            streak_7: {
              badge_key: "streak_7",
              name: "7-Day Streak",
              description: "Ran on 7 consecutive days",
              icon: "🔥",
            },
            streak_30: {
              badge_key: "streak_30",
              name: "30-Day Streak",
              description: "Ran on 30 consecutive days",
              icon: "⚡",
            },
          }

          const info = defs[badgeKey]
          if (info) {
            setNewBadge(info)
            setVisible(true)
            setTimeout(() => setVisible(false), 6000)
          }
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [supabase])

  if (!visible || !newBadge) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <Card className="w-80 border-primary shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-2xl shrink-0">
              {newBadge.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                <p className="font-semibold text-sm">New Badge Earned!</p>
              </div>
              <p className="font-bold text-base mt-1">{newBadge.name}</p>
              <p className="text-xs text-muted-foreground">{newBadge.description}</p>
            </div>
            <button
              onClick={() => setVisible(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
