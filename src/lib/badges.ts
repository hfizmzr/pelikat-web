"use server"

import { fetchDjangoApi } from "@/lib/django"
import { requireAuth } from "@/lib/auth/requireUser"

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
  await requireAuth()

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
  await requireAuth()

  return fetchDjangoApi("/ai/badges/definitions")
}
