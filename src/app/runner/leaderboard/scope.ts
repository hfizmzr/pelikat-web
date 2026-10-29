/**
 * Leaderboard theme-scope decision (spec §5.3): the leaderboard inherits an
 * event theme ONLY when `event_id` targets ONE published event — mixed-event
 * rankings (no event_id / 'all') and missing/unpublished events stay neutral.
 * Pure so the page's scope decision is unit-testable (Task 12 Step 1).
 *
 * The results-published check here intentionally mirrors the page's
 * `resultsLocked` derivation (page.tsx) — same events rows, two consumers:
 * `resultsLocked` hides the rankings, this scopes the theme. Keep them in
 * sync if the publication source ever changes.
 */
export function scopedLeaderboardEventId(
  eventId: string | undefined,
  events: { id: string; results_published: boolean }[] | null | undefined,
): string | null {
  if (!eventId || eventId === 'all') return null
  return (events ?? []).some((e) => e.id === eventId && e.results_published) ? eventId : null
}
