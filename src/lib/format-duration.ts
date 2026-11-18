/**
 * All-time run total for a narrow summary card. Seconds mean nothing on a
 * running total, and "48h 36m 12s" was cut to "48h 36…" in a third of a
 * phone-width row. Under an hour keeps m+s; from 100h the minutes go too.
 */
export function formatTotalTime(secs: number): string {
  const total = Math.max(0, Math.floor(secs))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h >= 100) return `${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${total % 60}s`
}
