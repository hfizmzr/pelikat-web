"use server"

import { fetchDjangoApi } from "@/lib/django"

interface AwardedBadge {
  badge_key: string
  name: string
  description: string
  icon: string
}

interface EvaluateResult {
  awarded: AwardedBadge[]
}

export async function evaluateBadges(
  runnerId: string,
  eventId?: string | null
): Promise<EvaluateResult> {
  const body: Record<string, string> = { runner_id: runnerId }
  if (eventId) {
    body.event_id = eventId
  }

  return fetchDjangoApi("/ai/badges/evaluate", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export async function getBadgeDefinitions(): Promise<
  { badges: AwardedBadge[] }
> {
  return fetchDjangoApi("/ai/badges/definitions")
}
