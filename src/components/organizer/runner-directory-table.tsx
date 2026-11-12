'use client'

import { Badge, MoreHorizontal, Search } from "lucide-react"
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

  const statusColor: Record<string, string> = {
    paid: 'text-success bg-success/15',
    waived: 'text-success bg-success/15',
    pending: 'text-primary bg-primary/15',
    failed: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/15',
    refunded: 'text-muted-foreground bg-accent',
  }

  return (
    <>
      {/* Search + filter */}
      <div className="bg-card rounded-xl p-3 border border-muted flex items-center gap-3">
        <Search className="text-muted-foreground size-[20px] ml-1 shrink-0" />
        <input
          className="flex-1 bg-transparent text-foreground text-[14px] leading-[20px] focus:outline-none placeholder:text-muted-foreground min-w-0"
          placeholder="Search by name, BIB number, email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1.5 shrink-0">
          {PILLS.map((f) => (
            <button
              key={f}
              onClick={() => setPill(f)}
              className={`px-2.5 py-1 rounded-lg text-[10px] leading-[14px] tracking-[0.05em] font-semibold transition-colors ${pill === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-muted overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-0 text-[10px] leading-[14px] tracking-[0.05em] font-semibold text-muted-foreground uppercase px-5 py-3 border-b border-muted bg-card">
            <div className="pr-4">#</div>
            <div>Runner</div>
            <div>Event / Category</div>
            <div className="px-4 text-center">BIB</div>
            <div className="px-4 text-center">Status</div>
            <div className="text-right">Actions</div>
          </div>

          {filtered.length > 0 ? (
            <div className="divide-y divide-muted">
              {filtered.map((reg, i) => (
                <div key={reg.id} className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-0 items-center px-5 py-3 hover:bg-card transition-colors">
                  <div className="pr-4 text-[12px] text-muted-foreground font-mono">{i + 1}</div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[12px] font-bold shrink-0">
                      {(reg.runnerName || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[14px] leading-[20px] font-medium text-foreground">{reg.runnerName || 'Unknown'}</div>
                      <div className="text-[11px] text-muted-foreground">—</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[13px] leading-[20px] text-muted-foreground">{reg.eventName || '—'}</div>
                    <div className="text-[11px] text-muted-foreground">{reg.categoryName || '—'}</div>
                  </div>
                  <div className="px-4 text-center">
                    {reg.bib_number ? (
                      <span className="px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-mono font-semibold border border-primary/20">
                        {reg.bibPrefix || ''}{reg.bib_number}
                      </span>
                    ) : (
                      <span className="text-[11px] text-border">—</span>
                    )}
                  </div>
                  <div className="px-4 text-center">
                    <span className={`text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold ${statusColor[reg.payment_status] || statusColor.failed}`}>
                      {reg.payment_status}
                    </span>
                  </div>
                  <div className="text-right">
                    <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors">
                      <MoreHorizontal className="size-[18px]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Badge className="size-[48px] mb-3" />
              <p className="text-[14px] font-medium">{query || pill !== 'All' ? 'No runners match the current filter' : 'No runners registered yet'}</p>
              <p className="text-[12px] mt-1">{query || pill !== 'All' ? 'Try a different search or filter' : 'Create and publish an event to accept registrations'}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
