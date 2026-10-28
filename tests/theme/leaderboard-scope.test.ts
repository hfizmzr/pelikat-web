import { describe, it, expect } from 'vitest'
import { scopedLeaderboardEventId } from '@/app/runner/leaderboard/scope'

// Spec §5.3: the leaderboard inherits an event theme ONLY when event_id
// targets ONE published event — mixed-event rankings stay neutral.
const EVENTS = [
  { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', results_published: true },
  { id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', results_published: false },
]

describe('scopedLeaderboardEventId', () => {
  it('single published event → scoped (returns the event id)', () => {
    expect(scopedLeaderboardEventId(EVENTS[0].id, EVENTS)).toBe(EVENTS[0].id)
  })

  it('missing event_id → neutral (mixed view)', () => {
    expect(scopedLeaderboardEventId(undefined, EVENTS)).toBeNull()
  })

  it("event_id 'all' → neutral (mixed view)", () => {
    expect(scopedLeaderboardEventId('all', EVENTS)).toBeNull()
  })

  it('stale/unknown event_id → neutral', () => {
    expect(scopedLeaderboardEventId('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', EVENTS)).toBeNull()
  })

  it('single event but results unpublished → neutral', () => {
    expect(scopedLeaderboardEventId(EVENTS[1].id, EVENTS)).toBeNull()
  })

  it('events query failed/empty → neutral', () => {
    expect(scopedLeaderboardEventId(EVENTS[0].id, null)).toBeNull()
    expect(scopedLeaderboardEventId(EVENTS[0].id, [])).toBeNull()
  })
})
