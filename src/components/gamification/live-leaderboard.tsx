"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Trophy, Medal, Crown, RefreshCw } from "lucide-react"

interface LeaderboardEntry {
  runner_id: string
  full_name: string
  gender: string | null
  event_id: string
  total_km: number
  rank: number
}

export function LiveLeaderboard({
  initialData,
  currentRunnerId,
}: {
  initialData: LeaderboardEntry[]
  currentRunnerId: string | undefined
}) {
  const supabase = createClient()
  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => initialData)
  const [isLive, setIsLive] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const prevDataKey = useRef(initialData.length)

  const refreshData = useCallback(async () => {
    const { data } = await supabase
      .from("leaderboard_virtual")
      .select("*")
      .order("rank", { ascending: true })
      .limit(50)

    if (data) {
      setEntries(data as LeaderboardEntry[])
    }
  }, [supabase])

  useEffect(() => {
    channelRef.current = supabase
      .channel("leaderboard-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "run_logs",
        },
        () => {
          if (isLive) refreshData()
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [isLive, refreshData, supabase])

  useEffect(() => {
    if (initialData.length !== prevDataKey.current) {
      setEntries(initialData)
      prevDataKey.current = initialData.length
    }
  }, [initialData])

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-6 w-6 text-yellow-500" />
      case 2:
        return <Medal className="h-6 w-6 text-gray-400" />
      case 3:
        return <Medal className="h-6 w-6 text-amber-700" />
      default:
        return <span className="text-muted-foreground font-bold text-lg">#{rank}</span>
    }
  }

  const myStats = entries?.find((e) => e.runner_id === currentRunnerId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLive ? "Live updates" : "Paused"}
        </p>
        <button
          onClick={() => setIsLive(!isLive)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${isLive ? "animate-spin" : ""}`} />
          {isLive ? "Pause" : "Resume"}
        </button>
      </div>

      {myStats && (
        <div className="rounded-lg border border-primary bg-primary/5 p-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
              {getRankIcon(myStats.rank)}
            </div>
            <div>
              <p className="text-xl font-bold">Rank #{myStats.rank}</p>
              <p className="text-muted-foreground">{myStats.total_km} KM total</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={`${entry.runner_id}-${entry.event_id}`}
            className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
              entry.runner_id === currentRunnerId
                ? "bg-primary/10 border border-primary"
                : "bg-secondary/50"
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 flex items-center justify-center">
                {getRankIcon(entry.rank)}
              </div>
              <div>
                <p className="font-medium">{entry.full_name}</p>
                {entry.runner_id === currentRunnerId && (
                  <Badge variant="default" className="text-xs mt-0.5">
                    You
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg">{entry.total_km} KM</p>
            </div>
          </div>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="text-center py-8">
          <Trophy className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No leaderboard data yet</p>
        </div>
      )}
    </div>
  )
}
