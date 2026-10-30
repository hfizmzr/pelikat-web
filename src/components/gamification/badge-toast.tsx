"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"
import { BADGE_DEFINITIONS } from "@/lib/badges-registry"
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

          // Shared registry mirrors pelikat-api BADGE_RULES — unknown keys
          // (rows inserted outside the engine) are silently ignored.
          const info = BADGE_DEFINITIONS[badgeKey]
          if (info) {
            setNewBadge({
              badge_key: info.badge_key,
              name: info.name,
              description: info.description,
              icon: info.icon,
            })
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
              type="button"
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
