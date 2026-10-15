"use client"

import { Crown, RefreshCw } from "lucide-react"
import { useEffect, useState, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

export interface LeaderboardEntry {
  runner_id: string
  full_name: string
  gender: string | null
  event_id: string
  total_km: number
  rank: number
  category_id?: string | null
  category_name?: string | null
}

export interface LeaderboardFilters {
  event_id?: string
  gender?: string
  category_id?: string
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="text-amber-500 dark:text-amber-400 size-[28px] drop-shadow-[0_0_8px_rgba(227,196,91,0.5)]" />
    case 2:
      return <Crown className="text-muted-foreground size-[24px]" />
    case 3:
      return <Crown className="text-amber-700 size-[24px]" />
    default:
      return <span className="text-muted-foreground font-bold text-[14px]">#{rank}</span>
  }
}

export function LiveLeaderboard({
  initialData,
  currentRunnerId,
  filters,
  publishedIds,
}: {
  initialData: LeaderboardEntry[]
  currentRunnerId: string | undefined
  filters?: LeaderboardFilters
  publishedIds?: string[]
}) {
  const supabase = createClient()
  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => initialData)
  const [isLive, setIsLive] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // pendingRef: request sequence — only the latest refresh may commit its data.
  const refreshSeq = useRef(0)
  // filterKey: identity of initialData + active filters, so a data/filters
  // change always re-seeds entries (row count alone can't detect content swaps).
  const dataKey = `${filters?.event_id ?? ''}|${filters?.gender ?? ''}|${filters?.category_id ?? ''}|${initialData.length}|${initialData[0]?.runner_id ?? ''}|${initialData[0]?.total_km ?? ''}`
  const prevDataKey = useRef(dataKey)
  const filtersRef = useRef(filters)
  const publishedIdsRef = useRef(publishedIds ?? [])

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  useEffect(() => {
    publishedIdsRef.current = publishedIds ?? []
  }, [publishedIds])

  const refreshData = useCallback(async () => {
    // Re-apply the active filters so realtime refreshes don't reset them,
    // and discard the response if filters changed or a newer refresh
    // superseded it (stale results must not overwrite the leaderboard).
    const seq = ++refreshSeq.current
    const f = filtersRef.current ?? {}
    let query = supabase
      .from("leaderboard_virtual")
      .select("*")
      .order("rank", { ascending: true })
      .limit(50)

    if (f.event_id) {
      query = query.eq("event_id", f.event_id)
    } else if (publishedIdsRef.current.length > 0) {
      // All-events view stays limited to published events (FR-69)
      query = query.in("event_id", publishedIdsRef.current)
    }
    if (f.gender) query = query.eq("gender", f.gender)
    if (f.category_id) query = query.eq("category_id", f.category_id)

    const { data } = await query

    if (data) {
      const current = filtersRef.current ?? {}
      if (
        refreshSeq.current === seq &&
        current.event_id === (f.event_id ?? undefined) &&
        current.gender === (f.gender ?? undefined) &&
        current.category_id === (f.category_id ?? undefined)
      ) {
        setEntries(data as LeaderboardEntry[])
      }
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
    if (dataKey !== prevDataKey.current) {
      setEntries(initialData)
      prevDataKey.current = dataKey
    }
  }, [dataKey, initialData])

  const myStats = entries?.find((e) => e.runner_id === currentRunnerId)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-card border border-border">
          {isLive && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
          )}
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {isLive ? "Live updates" : "Paused"}
          </span>
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border active:scale-95 transition-transform"
        >
          <RefreshCw className={`size-[14px] ${isLive ? 'animate-spin' : ''}`} />
          {isLive ? "Pause" : "Resume"}
        </button>
      </div>

      {myStats && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 blur-xl rounded-full -mt-6 -mr-6 pointer-events-none" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              {getRankIcon(myStats.rank)}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-primary uppercase tracking-widest mb-0.5">Your Rank</span>
              <p className="text-[20px] font-bold text-foreground leading-none">#{myStats.rank}</p>
            </div>
          </div>
          <div className="flex flex-col items-end relative z-10">
            <p className="font-mono text-[24px] font-extrabold text-primary leading-none">{myStats.total_km}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">KM Total</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mt-2">
        {entries.map((entry) => {
          const isMe = entry.runner_id === currentRunnerId;
          const isTop3 = entry.rank <= 3;
          
          return (
            <div
              key={`${entry.runner_id}-${entry.event_id}`}
              className={`flex items-center justify-between p-3.5 rounded-xl border ${
                isMe
                  ? "bg-primary/10 border-primary/30"
                  : isTop3
                    ? "bg-card border-border/80 shadow-lg"
                    : "bg-card/60 border-border/30"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`h-10 w-10 flex items-center justify-center rounded-full ${
                  isTop3 ? 'bg-muted' : ''
                }`}>
                  {getRankIcon(entry.rank)}
                </div>
                <div className="flex flex-col">
                  <p className="text-[14px] font-bold text-foreground flex items-center gap-2">
                    {entry.full_name}
                    {isMe && (
                      <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold">You</span>
                    )}
                  </p>
                  {entry.gender && (
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      {entry.gender === 'M' ? 'Male' : entry.gender === 'F' ? 'Female' : entry.gender}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <p className="font-mono text-[18px] font-bold text-foreground leading-none">{entry.total_km}</p>
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">KM</span>
              </div>
            </div>
          )
        })}
      </div>

      {entries.length === 0 && (
        <div className="bg-card rounded-2xl border border-border/60 p-8 flex flex-col items-center text-center mt-4">
          <Crown className="size-[48px] text-muted-foreground/50 mb-3" />
          <p className="text-[14px] font-bold text-foreground mb-1">No runners yet</p>
          <p className="text-[12px] text-muted-foreground">The leaderboard is currently empty</p>
        </div>
      )}
    </div>
  )
}
