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

/** Quote+escape a single CSV cell (RFC 4180 style — quotes doubled). Cells
 *  starting with an Excel formula prefix (=+-@) or a tab/CR/LF (OWASP CSV
 *  injection guidance) get a leading `'` so the value can't execute as a
 *  formula in spreadsheet apps. */
const csvCell = (value: unknown) => {
  const text = String(value).replace(/"/g, '""')
  // Finite numbers can't be formulas — keep them numeric (no guard quote,
  // so numeric sorting/calculations survive the export).
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `"${text}"`
  }
  return `"${/^[-=+@\t\r\n]/.test(text) ? `'${text}` : text}"`
}

/** Build CSV text from a header row and data rows. Quotes every cell. */
export function rowsToCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}
