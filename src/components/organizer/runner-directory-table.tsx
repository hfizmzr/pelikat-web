'use client'

import { Search } from "lucide-react"
import { StatusTag, type StatusTone } from '@/components/ui/status-tag'
import { useMemo, useState } from 'react'
import { isConfirmedStatus } from '@/lib/registration-status'

export interface RunnerDirectoryRow {
  id: string
  bib_number: string | null
  payment_status: string
  runnerName: string | null
  eventName: string | null
  categoryName: string | null
  bibPrefix: string | null
}

type Pill = 'All' | 'Paid' | 'Pending' | 'No BIB'

// Audit #6: the filter pills (and the search box) were click-silent — wire
// them to actually filter the table below and move the active-pill state.
const PILLS: Pill[] = ['All', 'Paid', 'Pending', 'No BIB']

function matchesPill(row: RunnerDirectoryRow, pill: Pill) {
  switch (pill) {
    case 'Paid':
      return isConfirmedStatus(row.payment_status)
    case 'Pending':
      return row.payment_status === 'pending'
    case 'No BIB':
      return !row.bib_number
    default:
      return true
  }
}

function matchesSearch(row: RunnerDirectoryRow, q: string) {
  if (!q) return true
  const needle = q.toLowerCase()
  return [row.runnerName, row.eventName, row.categoryName, row.bib_number]
    .some(v => (v ?? '').toLowerCase().includes(needle))
}

export function RunnerDirectoryTable({ rows }: { rows: RunnerDirectoryRow[] }) {
  const [pill, setPill] = useState<Pill>('All')
  const [query, setQuery] = useState('')

  const filtered = useMemo(
    () => rows.filter(r => matchesPill(r, pill) && matchesSearch(r, query.trim())),
    [rows, pill, query]
  )

  // waived is a confirmed entry (complimentary), so it reads like paid.
  const statusTone: Record<string, StatusTone> = {
    paid: 'success',
    waived: 'success',
    pending: 'warning',
    failed: 'destructive',
    refunded: 'neutral',
  }

  // bib_number usually already carries the category prefix (allocate_bib);
  // only prepend it for legacy numbers that do not.
  const bibOf = (r: RunnerDirectoryRow) =>
    r.bib_number && r.bibPrefix && !r.bib_number.startsWith(r.bibPrefix) ? `${r.bibPrefix}${r.bib_number}` : r.bib_number

  const COLS = 'grid grid-cols-[40px_minmax(200px,1.2fr)_minmax(220px,1.4fr)_140px_110px] items-center gap-4'

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <input
            className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            placeholder="Search"
            aria-label="Search by name, bib number, event or category"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex h-10 items-center gap-0.5 rounded-lg border border-border bg-card p-1" role="tablist" aria-label="Filter runners">
          {PILLS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={pill === f}
              onClick={() => setPill(f)}
              className={`h-8 rounded-md px-3 text-[13px] transition-colors ${pill === f ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f === 'No BIB' ? 'No bib' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="min-w-[760px]">
          <div className={`${COLS} border-b border-border px-5 py-2.5 text-[12px] text-muted-foreground`}>
            <span className="text-right">#</span>
            <span>Runner</span>
            <span>Event and category</span>
            <span>Bib</span>
            <span>Payment</span>
          </div>

          {filtered.length > 0 ? (
            <ul className="divide-y divide-border">
              {filtered.map((reg, i) => {
                const bib = bibOf(reg)
                return (
                  <li key={reg.id} className={`${COLS} min-h-14 px-5 py-2.5`}>
                    <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">{i + 1}</span>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-medium text-foreground">
                        {(reg.runnerName || 'U').charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-[14px] text-foreground">{reg.runnerName || 'Unknown runner'}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-foreground">{reg.eventName || '—'}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{reg.categoryName || '—'}</p>
                    </div>
                    <span className={`font-mono text-[13px] tabular-nums ${bib ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {bib || 'Not assigned'}
                    </span>
                    <span><StatusTag status={reg.payment_status} tone={statusTone[reg.payment_status] ?? 'destructive'} /></span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] text-foreground">{query || pill !== 'All' ? 'No runners match this filter' : 'No runners registered yet'}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{query || pill !== 'All' ? 'Try a different search or filter' : 'Publish an event to start taking registrations'}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
