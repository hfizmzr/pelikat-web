import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Two-letter display initials ("Maya Ling" → "ML"); null/empty → "U". */
export function getInitials(name: string | null | undefined) {
  if (!name) return 'U'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/** Quote+escape a single CSV cell (RFC 4180 style — quotes doubled). */
const csvCell = (value: unknown) => `"${String(value).replace(/"/g, '""')}"`

/** Build CSV text from a header row and data rows. Quotes every cell. */
export function rowsToCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}
