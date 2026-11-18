'use client'

import { ArrowUpDown } from 'lucide-react'
import type { ReactNode } from 'react'

export { getInitials } from '@/lib/utils'

// Initials avatars are neutral; colour is kept for status, not identity.
export const INITIALS_COLORS = [
  { bg: 'bg-accent', text: 'text-foreground' },
]

export const ITEMS_PER_PAGE = 25

/** Sortable table column header with the shared admin styling. */
export function TableSortHeader({
  label,
  onSort,
  className,
}: {
  label: string
  onSort: () => void
  className?: string
}) {
  return (
    <th className={`py-3 px-4 ${className ?? ''}`}>
      <button
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-muted-foreground transition-colors font-inter"
        onClick={onSort}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  )
}

/**
 * Shared pagination footer: "Showing x–y of N noun" plus prev/next. The
 * middle slot is table-specific (page-number buttons on organizers,
 * "Page X of Y" on applicants).
 */
export function TablePagination({
  rankedTotal,
  total,
  noun,
  currentPage,
  totalPages,
  onPrev,
  onNext,
  middle,
}: {
  rankedTotal: number
  total: number
  noun: string
  currentPage: number
  totalPages: number
  onPrev: () => void
  onNext: () => void
  middle?: ReactNode
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
      <p className="text-[12px] text-muted-foreground font-inter">
        Showing{' '}
        <span className="text-foreground font-medium">
          {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
          {Math.min(currentPage * ITEMS_PER_PAGE, rankedTotal)}
        </span>{' '}
        of{' '}
        <span className="text-foreground font-medium">{total}</span>{' '}
        {noun}
      </p>
      <div className="flex items-center gap-1">
        <button
          className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent text-muted-foreground text-[12px] transition-colors border border-border/30 disabled:opacity-40 disabled:cursor-not-allowed font-inter"
          disabled={currentPage === 1}
          onClick={onPrev}
        >
          Previous
        </button>
        {middle}
        <button
          className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent text-muted-foreground text-[12px] transition-colors border border-border/30 disabled:opacity-40 disabled:cursor-not-allowed font-inter"
          disabled={currentPage === totalPages}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  )
}
