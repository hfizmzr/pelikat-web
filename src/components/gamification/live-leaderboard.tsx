"use client"

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
      return <span className="material-symbols-outlined text-[#e3c45b] text-[28px] drop-shadow-[0_0_8px_rgba(227,196,91,0.5)]">social_leaderboard</span>
    case 2:
      return <span className="material-symbols-outlined text-[#cbc3d7] text-[24px]">social_leaderboard</span>
    case 3:
      return <span className="material-symbols-outlined text-[#a07455] text-[24px]">social_leaderboard</span>
    default:
      return <span className="text-[#958ea0] font-bold text-[14px]">#{rank}</span>
  }
}

export function LiveLeaderboard({
  initialData,
  currentRunnerId,
  filters,
}: {
  initialData: LeaderboardEntry[]
  currentRunnerId: string | undefined
  filters?: LeaderboardFilters
}) {
  const supabase = createClient()
  const [entries, setEntries] = useState<LeaderboardEntry[]>(() => initialData)
  const [isLive, setIsLive] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const prevDataKey = useRef(initialData.length)
  const filtersRef = useRef(filters)

  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  const refreshData = useCallback(async () => {
    // Re-apply the active filters so realtime refreshes don't reset them
    const f = filtersRef.current ?? {}
    let query = supabase
      .from("leaderboard_virtual")
      .select("*")
      .order("rank", { ascending: true })
      .limit(50)

    if (f.event_id) query = query.eq("event_id", f.event_id)
    if (f.gender) query = query.eq("gender", f.gender)
    if (f.category_id) query = query.eq("category_id", f.category_id)

    const { data } = await query

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

  const myStats = entries?.find((e) => e.runner_id === currentRunnerId)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#1c1b1d] border border-[#353437]">
          {isLive && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4edea3] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4edea3]" />
            </span>
          )}
          <span className="text-[10px] font-bold text-[#958ea0] uppercase tracking-wider">
            {isLive ? "Live updates" : "Paused"}
          </span>
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className="flex items-center gap-1.5 text-[12px] font-bold text-[#cbc3d7] bg-[#23232b] px-2.5 py-1 rounded-full border border-[#353437] active:scale-95 transition-transform"
        >
          <span className={`material-symbols-outlined text-[14px] ${isLive ? 'animate-spin' : ''}`}>sync</span>
          {isLive ? "Pause" : "Resume"}
        </button>
      </div>

      {myStats && (
        <div className="rounded-2xl border border-[#d0bcff]/30 bg-[#d0bcff]/5 p-4 flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#d0bcff]/10 blur-xl rounded-full -mt-6 -mr-6 pointer-events-none" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="h-14 w-14 rounded-full bg-[#d0bcff]/10 flex items-center justify-center border border-[#d0bcff]/20">
              {getRankIcon(myStats.rank)}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-[#d0bcff] uppercase tracking-widest mb-0.5">Your Rank</span>
              <p className="text-[20px] font-bold text-[#e5e1e4] leading-none">#{myStats.rank}</p>
            </div>
          </div>
          <div className="flex flex-col items-end relative z-10">
            <p className="font-mono text-[24px] font-extrabold text-[#d0bcff] leading-none">{myStats.total_km}</p>
            <p className="text-[10px] text-[#958ea0] font-bold uppercase tracking-widest mt-1">KM Total</p>
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
                  ? "bg-[#d0bcff]/10 border-[#d0bcff]/30"
                  : isTop3
                    ? "bg-[#1c1b1d] border-[#353437]/80 shadow-lg"
                    : "bg-[#1c1b1d]/60 border-[#353437]/30"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`h-10 w-10 flex items-center justify-center rounded-full ${
                  isTop3 ? 'bg-[#23232b]' : ''
                }`}>
                  {getRankIcon(entry.rank)}
                </div>
                <div className="flex flex-col">
                  <p className="text-[14px] font-bold text-[#e5e1e4] flex items-center gap-2">
                    {entry.full_name}
                    {isMe && (
                      <span className="bg-[#d0bcff] text-[#3c0091] px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold">You</span>
                    )}
                  </p>
                  {entry.gender && (
                    <span className="text-[11px] text-[#958ea0] uppercase tracking-wider mt-0.5">
                      {entry.gender === 'M' ? 'Male' : entry.gender === 'F' ? 'Female' : entry.gender}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <p className="font-mono text-[18px] font-bold text-[#e5e1e4] leading-none">{entry.total_km}</p>
                <span className="text-[9px] text-[#958ea0] font-bold uppercase tracking-widest mt-1">KM</span>
              </div>
            </div>
          )
        })}
      </div>

      {entries.length === 0 && (
        <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 p-8 flex flex-col items-center text-center mt-4">
          <span className="material-symbols-outlined text-[48px] text-[#353437] mb-3">social_leaderboard</span>
          <p className="text-[14px] font-bold text-[#e5e1e4] mb-1">No runners yet</p>
          <p className="text-[12px] text-[#958ea0]">The leaderboard is currently empty</p>
        </div>
      )}
    </div>
  )
}
