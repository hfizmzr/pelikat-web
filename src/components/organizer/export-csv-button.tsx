'use client'

import { Download, LoaderCircle } from "lucide-react"
import { useState } from 'react'
import { rowsToCsv } from '@/lib/utils'

/**
 * Real CSV download button for server-rendered organizer pages (audit #8 —
 * the admin side's exportRegistrationsToCSV pattern, extracted so server
 * pages can pass serializable rows instead of wiring handlers). Also used by
 * the runner directory's Export CSV and the financial page's Export Report.
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
  const [exporting, setExporting] = useState(false)

  const handleExport = () => {
    setExporting(true)
    try {
      const csv = rowsToCsv(headers, rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <button onClick={handleExport} disabled={exporting} className={className}>
      {exporting ? <LoaderCircle className="size-[18px] animate-spin" /> : <Download className="size-[18px]" />}
      {children}
    </button>
  )
}
