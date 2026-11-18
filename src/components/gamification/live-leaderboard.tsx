"use client"

import { Pause, Play } from "lucide-react"
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
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
          )}
          <span className="text-[12px] text-muted-foreground">
            {isLive ? "Live updates" : "Paused"}
          </span>
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {isLive ? <Pause className="size-3.5" strokeWidth={1.75} /> : <Play className="size-3.5" strokeWidth={1.75} />}
          {isLive ? "Pause" : "Resume"}
        </button>
      </div>

      {myStats && (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card p-4">
          <div>
            <p className="text-[13px] text-muted-foreground">Your rank</p>
            <p className="mt-1 text-[28px] leading-none font-medium tabular-nums text-foreground">#{myStats.rank}</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] text-muted-foreground">Distance</p>
            <p className="mt-1 text-[28px] leading-none font-medium tabular-nums text-foreground">
              {myStats.total_km}<span className="ml-1 text-[14px] font-normal text-muted-foreground">km</span>
            </p>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <ol className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
          {entries.map((entry) => {
            const isMe = entry.runner_id === currentRunnerId
            return (
              <li
                key={`${entry.runner_id}-${entry.event_id}`}
                className={`relative flex min-h-14 items-center gap-3 px-4 py-2.5 ${isMe ? 'bg-accent' : ''}`}
              >
                {isMe && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />}
                <span className={`w-7 shrink-0 font-mono text-[13px] tabular-nums ${entry.rank <= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {String(entry.rank).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-foreground">
                    {entry.full_name}
                    {isMe && <span className="ml-2 text-[12px] text-muted-foreground">You</span>}
                  </p>
                  {entry.gender && (
                    <p className="text-[12px] text-muted-foreground">
                      {entry.gender === 'M' ? 'Male' : entry.gender === 'F' ? 'Female' : entry.gender}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-[15px] tabular-nums text-foreground">
                  {entry.total_km}<span className="ml-1 text-[12px] text-muted-foreground">km</span>
                </p>
              </li>
            )
          })}
        </ol>
      )}

      {entries.length === 0 && (
        <div className="rounded-xl border border-border/60 bg-card px-6 py-12 text-center">
          <p className="text-[15px] text-foreground">No runners yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Rankings appear once runners log distance</p>
        </div>
      )}
    </div>
  )
}
