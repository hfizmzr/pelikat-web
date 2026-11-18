// Calendar-date helpers for events. events.event_date is a Postgres `date`
// (no time, no zone) and every Pelikat race runs in Malaysia, so "today" has
// to be the Malaysian calendar date, not the server's UTC date and not
// `new Date(event_date)` (UTC midnight = 08:00 in Malaysia, which drops a
// race off the console halfway through race morning).

const MALAYSIA_TZ = 'Asia/Kuala_Lumpur'

/** Today's date in Malaysia as YYYY-MM-DD, comparable to events.event_date. */
export function malaysiaToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Statuses an event can have and still be run from the race console:
 * `closed` only means registration has closed, the race itself may be ahead.
 * Drafts are never shown.
 */
export const RACE_CONSOLE_STATUSES = ['published', 'closed'] as const

/** True for an event the organizer may still run: not a draft, dated today or later. */
export function isUpcomingRace(
  event: { status: string; event_date: string },
  today: string = malaysiaToday(),
): boolean {
  return (
    (RACE_CONSOLE_STATUSES as readonly string[]).includes(event.status) &&
    event.event_date >= today
  )
}

/** True when the event takes place today (Malaysian date). */
export function isRaceDay(eventDate: string, today: string = malaysiaToday()): boolean {
  return eventDate === today
}
