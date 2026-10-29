import { describe, it, expect } from 'vitest'
import { scopedLeaderboardEventId } from '@/app/runner/leaderboard/scope'

// Spec §5.3: the leaderboard inherits an event theme ONLY when event_id
// targets ONE published event — mixed-event rankings stay neutral.
// F1 hardening (P3 Task 4): the predicate is explicit about status — after
// migration 082 a closed row is publicly readable but is NOT a published
// leaderboard scope.
const EVENTS = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'published', results_published: true },
  { id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', status: 'published', results_published: false },
  { id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', status: 'closed', results_published: true },
  { id: 'd2eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', status: 'draft', results_published: true },
]

const PUBLISHED = EVENTS[0].id

describe('scopedLeaderboardEventId', () => {
  it('single published event → scoped (returns the event id)', () => {
    expect(scopedLeaderboardEventId(PUBLISHED, EVENTS)).toBe(PUBLISHED)
  })

  it('missing event_id → neutral (mixed view)', () => {
    expect(scopedLeaderboardEventId(undefined, EVENTS)).toBeNull()
  })

  it("event_id 'all' → neutral (mixed view)", () => {
    expect(scopedLeaderboardEventId('all', EVENTS)).toBeNull()
  })

  it('stale/unknown event_id → neutral', () => {
    expect(scopedLeaderboardEventId('e2eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', EVENTS)).toBeNull()
  })

  it('single event but results unpublished → neutral', () => {
    expect(scopedLeaderboardEventId(EVENTS[1].id, EVENTS)).toBeNull()
  })

  it('F1: closed event with results_published → NOT scoped (082 widened anon reads)', () => {
    expect(scopedLeaderboardEventId(EVENTS[2].id, EVENTS)).toBeNull()
  })

  it('F1: draft row (owner-visible) with results_published → NOT scoped', () => {
    expect(scopedLeaderboardEventId(EVENTS[3].id, EVENTS)).toBeNull()
  })

  it('events query failed/empty → neutral', () => {
    expect(scopedLeaderboardEventId(PUBLISHED, null)).toBeNull()
    expect(scopedLeaderboardEventId(PUBLISHED, [])).toBeNull()
  })
})
