/**
 * FR-54: race-day schedule card fed from the migration-092 event columns
 * (start_time / flag_off_time / cutoff_time, all nullable). Server pages
 * thread the three columns straight through; NULL renders "To be announced"
 * per row, and an event with no times at all renders a single TBA line.
 */

interface RaceDayScheduleCardProps {
  startTime: string | null
  flagOffTime: string | null
  cutoffTime: string | null
}

/** DB `time` arrives as 'HH:MM[:SS]' — rendered as 12h 'h:MM AM/PM'. */
function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${mStr} ${suffix}`
}

export function RaceDayScheduleCard({ startTime, flagOffTime, cutoffTime }: RaceDayScheduleCardProps) {
  const rows = [
    { label: 'Event Start', value: startTime },
    { label: 'Flag-Off', value: flagOffTime },
    { label: 'Cut-Off', value: cutoffTime },
  ]

  return (
    <div className="bg-card p-4 rounded-2xl border border-border/60">
      <h3 className="text-[13px] font-bold text-foreground mb-3">Race-Day Schedule</h3>
      {rows.every((row) => !row.value) ? (
        <p className="text-[12px] text-muted-foreground">Schedule to be announced</p>
      ) : (
        <dl className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between items-center">
              <dt className="text-[12px] text-muted-foreground">{row.label}</dt>
              <dd className="text-[12px] font-bold text-foreground">
                {row.value ? formatTime(row.value) : 'To be announced'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
