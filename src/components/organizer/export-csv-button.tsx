'use client'

import { Download } from "lucide-react"
import { rowsToCsv } from '@/lib/utils'

/**
 * Real CSV download button for server-rendered organizer pages (audit #8 —
 * the admin side's exportRegistrationsToCSV pattern, extracted so server
 * pages can pass serializable rows instead of wiring handlers). Also used by
 * the runner directory's Export CSV and the financial page's Export Report.
 *
 * No spinner state: the blob construction is synchronous, so an
 * exporting/disabled state could never paint before the click handler
 * returns (removed as dead code).
 */
export function ExportCsvButton({
  filename,
  headers,
  rows,
  children,
  className = 'px-4 py-2.5 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-2 transition-colors border border-muted',
}: {
  filename: string
  headers: readonly string[]
  rows: readonly (readonly unknown[])[]
  children?: React.ReactNode
  className?: string
}) {
  const handleExport = () => {
    const csv = rowsToCsv(headers, rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button onClick={handleExport} className={className}>
      <Download className="size-[18px]" />
      {children}
    </button>
  )
}
