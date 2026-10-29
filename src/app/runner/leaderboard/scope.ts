/**
 * Leaderboard theme-scope decision (spec §5.3): the leaderboard inherits an
 * event theme ONLY when `event_id` targets ONE PUBLISHED event — mixed-event
 * rankings (no event_id / 'all') and missing/unpublished events stay neutral.
 * Pure so the page's scope decision is unit-testable (Task 12 Step 1).
 *
 * F1 hardening (Task 2 review carry, P3 Task 4): `status === 'published'` is
 * explicit — after migration 082 widened the public SELECT to closed events, a
 * closed row (even with results_published) must never become the themed scope.
 * The restriction lives HERE ONLY: the page's events-list query is NOT
 * status-filtered — it feeds the dropdown and the results-publication
 * derivation, and a closed event with published results must stay viewable on
 * the leaderboard (rankings availability is status-independent; theme scoping
 * is published-only).
 *
 * The results-published check intentionally mirrors the page's `resultsLocked`
 * derivation (page.tsx) — same events rows, two consumers: `resultsLocked`
 * hides the rankings, this scopes the theme. Keep them in sync if the
 * publication source ever changes.
 */
export function scopedLeaderboardEventId(
  eventId: string | undefined,
  events: { id: string; status: string; results_published: boolean }[] | null | undefined,
): string | null {
  if (!eventId || eventId === 'all') return null
  return (events ?? []).some(
    (e) => e.id === eventId && e.status === 'published' && e.results_published,
  )
    ? eventId
    : null
}
