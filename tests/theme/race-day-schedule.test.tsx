// Covers: FR-54 (UC13 live race-day schedule card)

/**
 * FR-54: RaceDayScheduleCard contract — the migration-092 race-day schedule
 * columns (start_time / flag_off_time / cutoff_time, all nullable) render as
 * a three-row card with 12h 'h:MM AM/PM' formatting; per-row NULLs fall back
 * to "To be announced"; an event with NO times renders a single TBA line.
 * The legacy hardcoded "Starts at 6:00 AM" hero copy must be gone.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { RaceDayScheduleCard } from '@/components/runner/race-day-schedule-card'

afterEach(cleanup)

describe('RaceDayScheduleCard (FR-54)', () => {
  it('renders all three seeded times as 12h rows', () => {
    render(
      <RaceDayScheduleCard startTime="05:30:00" flagOffTime="06:00" cutoffTime="10:30:00" />
    )
    expect(screen.getByRole('heading', { name: 'Race-Day Schedule' })).toBeInTheDocument()
    expect(screen.getByText('Event Start')).toBeInTheDocument()
    expect(screen.getByText('Flag-Off')).toBeInTheDocument()
    expect(screen.getByText('Cut-Off')).toBeInTheDocument()
    expect(screen.getByText('5:30 AM')).toBeInTheDocument()
    expect(screen.getByText('6:00 AM')).toBeInTheDocument()
    expect(screen.getByText('10:30 AM')).toBeInTheDocument()
    expect(screen.queryByText('To be announced')).not.toBeInTheDocument()
  })

  it('individual NULL column → "To be announced" on that row only', () => {
    render(<RaceDayScheduleCard startTime={null} flagOffTime="06:00" cutoffTime={null} />)
    expect(screen.queryByText('5:30 AM')).not.toBeInTheDocument()
    expect(screen.getByText('6:00 AM')).toBeInTheDocument()
    expect(screen.getAllByText('To be announced')).toHaveLength(2)
  })

  it('all three NULL → single "Schedule to be announced" line, no time rows', () => {
    render(<RaceDayScheduleCard startTime={null} flagOffTime={null} cutoffTime={null} />)
    expect(screen.getByRole('heading', { name: 'Race-Day Schedule' })).toBeInTheDocument()
    expect(screen.getByText('Schedule to be announced')).toBeInTheDocument()
    expect(screen.queryByText('Event Start')).not.toBeInTheDocument()
    expect(screen.queryByText('Flag-Off')).not.toBeInTheDocument()
    expect(screen.queryByText('Cut-Off')).not.toBeInTheDocument()
  })

  it('evening event (18:00/20:30/23:30) formats correctly with PM suffix', () => {
    render(
      <RaceDayScheduleCard startTime="18:00:00" flagOffTime="20:30:00" cutoffTime="23:30:00" />
    )
    expect(screen.getByText('6:00 PM')).toBeInTheDocument()
    expect(screen.getByText('8:30 PM')).toBeInTheDocument()
    expect(screen.getByText('11:30 PM')).toBeInTheDocument()
  })

  it('legacy hardcoded "Starts at 6:00 AM" copy is absent from the card output', () => {
    const { container } = render(
      <RaceDayScheduleCard startTime="05:30:00" flagOffTime="06:00:00" cutoffTime="10:30:00" />
    )
    expect(container.textContent).not.toContain('Starts at 6:00 AM')
  })
})
