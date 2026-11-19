// Covers: race console / mobile home event selection (Malaysian calendar date)

import { describe, it, expect } from 'vitest'
import { isRaceDay, isUpcomingRace, malaysiaToday } from '@/lib/event-dates'

describe('malaysiaToday', () => {
  it('uses the Malaysian date, not UTC', () => {
    // 2027-01-02 17:30 UTC is 2027-01-03 01:30 in Malaysia (UTC+8).
    expect(malaysiaToday(new Date('2027-01-02T17:30:00Z'))).toBe('2027-01-03')
    // 2027-01-03 15:59 UTC is still 23:59 on the 3rd in Malaysia.
    expect(malaysiaToday(new Date('2027-01-03T15:59:00Z'))).toBe('2027-01-03')
    expect(malaysiaToday(new Date('2027-01-03T16:00:00Z'))).toBe('2027-01-04')
  })
})

describe('isUpcomingRace', () => {
  const today = '2026-11-19'

  it('keeps a race on its own day all day (the old UTC check dropped it at 08:00)', () => {
    const raceMorning10am = new Date('2026-11-19T02:00:00Z') // 10:00 in Malaysia
    expect(isUpcomingRace({ status: 'published', event_date: '2026-11-19' }, malaysiaToday(raceMorning10am))).toBe(true)
  })

  it('excludes past events', () => {
    expect(isUpcomingRace({ status: 'published', event_date: '2026-10-21' }, today)).toBe(false)
  })

  it('includes closed events: closed only means registration closed', () => {
    expect(isUpcomingRace({ status: 'closed', event_date: '2026-12-01' }, today)).toBe(true)
  })

  it('never includes drafts', () => {
    expect(isUpcomingRace({ status: 'draft', event_date: '2026-12-01' }, today)).toBe(false)
  })
})

describe('isRaceDay', () => {
  it('is true only on the event date', () => {
    expect(isRaceDay('2026-11-19', '2026-11-19')).toBe(true)
    expect(isRaceDay('2026-11-20', '2026-11-19')).toBe(false)
  })
})
