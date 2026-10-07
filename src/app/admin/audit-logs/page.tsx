'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { AuditLogFilters, type AuditLogFilters as Filters } from '@/components/admin/audit-log-filters'

const ITEMS_PER_PAGE = 20

interface AuditLog {
  id: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  action: string
  target_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ─── CSV export helper ────────────────────────────────────────────────────────
function exportToCSV(logs: AuditLog[]) {
  const headers = ['Timestamp', 'Actor', 'Action', 'Target ID', 'Details']
  const rows = logs.map((log) => {
    const actor = log.actor_email || (log.metadata?.table ? 'System (DB Trigger)' : 'System')
    const details = log.metadata?.operation
      ? `${log.metadata.operation as string} on ${log.metadata.table as string}`
      : log.metadata
        ? JSON.stringify(log.metadata).slice(0, 80)
        : ''
    return [
      new Date(log.created_at).toISOString(),
      actor,
      log.action,
      log.target_id || '',
      details,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`)
  })

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminAuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [allLogs, setAllLogs] = useState<AuditLog[]>([]) // for export
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    actionType: 'all',
    startDate: undefined,
    endDate: undefined,
  })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const supabase = createClient()

  const fetchLogs = useCallback(async () => {
    setLoading(true)

    let query = supabase.from('audit_log').select('*', { count: 'exact' })

    if (filters.actionType !== 'all') {
      query = query.ilike('action', `%${filters.actionType}%`)
    }
    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString())
    }
    if (filters.endDate) {
      const endOfDay = new Date(filters.endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query = query.lte('created_at', endOfDay.toISOString())
    }

    query = query.order('created_at', { ascending: false })

    const from = (currentPage - 1) * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1
    query = query.range(from, to)

    const { data, count, error } = await query

    if (!error && data) {
      let filtered = data
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        filtered = filtered.filter(
          (log) =>
            (log.actor_id && log.actor_id.toLowerCase().includes(searchLower)) ||
            (log.target_id && log.target_id.toLowerCase().includes(searchLower)) ||
            (log.action && log.action.toLowerCase().includes(searchLower))
        )
      }
      setAuditLogs(filtered)
      setTotalCount(count || 0)
    }

    setLoading(false)
  }, [currentPage, filters, supabase])

  useEffect(() => {
    const controller = new AbortController()
    fetchLogs()
    return () => controller.abort()
  }, [fetchLogs])

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters)
    setCurrentPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    // Fetch all matching logs (no pagination) for export
    let query = supabase.from('audit_log').select('*')
    if (filters.actionType !== 'all') query = query.ilike('action', `%${filters.actionType}%`)
    if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString())
    if (filters.endDate) {
      const end = new Date(filters.endDate)
      end.setHours(23, 59, 59, 999)
      query = query.lte('created_at', end.toISOString())
    }
    query = query.order('created_at', { ascending: false }).limit(5000)
    const { data } = await query
    if (data) exportToCSV(data)
    setExporting(false)
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  return (
    <div className="flex flex-col gap-8 font-inter text-[#e5e1e4]">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#4edea3]">verified</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#4edea3] font-inter">Compliance</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-[#e5e1e4] tracking-tight">Audit Logs</h1>
          <p className="text-[13px] text-[#958ea0]">
            Immutable activity ledger — {totalCount.toLocaleString()} records
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2a2a2c] hover:bg-[#353437] text-[#e5e1e4] text-[13px] font-medium font-inter border border-[#494454]/30 transition-colors disabled:opacity-50"
        >
          {exporting
            ? <Loader2 className="h-4 w-4 animate-spin text-[#d0bcff]" />
            : <span className="material-symbols-outlined text-[18px] text-[#d0bcff]">download</span>
          }
          Export CSV
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 p-4">
        <AuditLogFilters onFilterChange={handleFilterChange} />
      </div>

      {/* ── Log Table ───────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-hidden">
        <div className="p-5 border-b border-[#494454]/30 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#4edea3] text-[20px]">receipt_long</span>
          <h2 className="font-jakarta font-semibold text-[18px] text-[#e5e1e4]">Activity Ledger</h2>
          <span className="ml-auto text-[11px] text-[#494454] font-mono">
            Page {currentPage} of {totalPages || 1}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#d0bcff]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#494454]/30">
                  {['Timestamp', 'Actor', 'Action', 'Target', 'Details', ''].map((h, i) => (
                    <th key={i} className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#353437]/30 text-[13px]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#958ea0]">
                      <span className="material-symbols-outlined text-[32px] block mb-2 text-[#494454]">search_off</span>
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => {
                    const isExpanded = expandedRows.has(log.id)
                    const actorLabel = log.actor_email
                      ? (log.actor_name || log.actor_email)
                      : (log.metadata && (log.metadata as Record<string, unknown>).table
                        ? 'System (DB Trigger)'
                        : 'System')

                    return (
                      <Fragment key={log.id}>
                        <tr
                          className="hover:bg-[#201f22]/60 cursor-pointer transition-colors"
                          onClick={() => {
                            setExpandedRows((prev) => {
                              const next = new Set(prev)
                              if (next.has(log.id)) next.delete(log.id)
                              else next.add(log.id)
                              return next
                            })
                          }}
                        >
                          <td className="py-3.5 px-4">
                            <span className="text-[11px] font-mono text-[#958ea0]">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded bg-[#d0bcff]/10 text-[#d0bcff] text-[11px] font-medium border border-[#d0bcff]/20 font-inter truncate max-w-[140px] inline-block">
                              {actorLabel}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-[#e5e1e4] capitalize">
                              {log.action?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded bg-[#201f22] text-[#958ea0] font-mono text-[11px] border border-[#494454]/20">
                              {log.target_id?.slice(0, 8) || '—'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-[200px]">
                            <span className="text-[#cbc3d7] text-[12px] truncate block">
                              {log.metadata && (log.metadata as Record<string, unknown>).operation
                                ? `${(log.metadata as Record<string, unknown>).operation as string} on ${(log.metadata as Record<string, unknown>).table as string}`
                                : log.metadata
                                  ? JSON.stringify(log.metadata).slice(0, 50)
                                  : '—'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`material-symbols-outlined text-[18px] text-[#494454] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              expand_more
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-[#494454]/20">
                            <td colSpan={6} className="px-4 py-4 bg-[#131315]/60">
                              <div className="flex flex-col gap-3">
                                {log.old_data && (
                                  <div>
                                    <p className="text-[11px] font-bold text-[#ffb4ab] mb-1.5 font-inter uppercase tracking-wide">Previous Data</p>
                                    <pre className="text-[11px] text-[#cbc3d7] bg-[#93000a]/10 border border-[#ffb4ab]/10 p-3 rounded-lg overflow-auto max-h-40 font-mono">
                                      {JSON.stringify(log.old_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.new_data && (
                                  <div>
                                    <p className="text-[11px] font-bold text-[#4edea3] mb-1.5 font-inter uppercase tracking-wide">New Data</p>
                                    <pre className="text-[11px] text-[#cbc3d7] bg-[#4edea3]/5 border border-[#4edea3]/10 p-3 rounded-lg overflow-auto max-h-40 font-mono">
                                      {JSON.stringify(log.new_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.metadata && (
                                  <div>
                                    <p className="text-[11px] font-bold text-[#958ea0] mb-1.5 font-inter uppercase tracking-wide">Context</p>
                                    <pre className="text-[11px] text-[#cbc3d7] bg-[#201f22] border border-[#494454]/20 p-3 rounded-lg overflow-auto max-h-40 font-mono">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-[#958ea0] font-inter">
            Showing{' '}
            <span className="text-[#e5e1e4] font-semibold">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}
            </span>{' '}
            of <span className="text-[#e5e1e4] font-semibold">{totalCount.toLocaleString()}</span> logs
          </p>
          <div className="flex items-center gap-1">
            <button
              className="px-3 py-1.5 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] text-[12px] font-inter border border-[#494454]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="px-3 text-[12px] text-[#cbc3d7] font-inter">
              {currentPage} / {totalPages}
            </span>
            <button
              className="px-3 py-1.5 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] text-[12px] font-inter border border-[#494454]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
