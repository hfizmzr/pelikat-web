"use client"

import dynamic from "next/dynamic"

const RunnerTracker = dynamic(
  () => import("@/components/gamification/runner-tracker"),
  { ssr: false }
)

export default function TrackPage() {
  return <RunnerTracker />
}
