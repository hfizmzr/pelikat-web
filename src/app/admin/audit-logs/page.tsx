'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { AuditLogFilters, type AuditLogFilters as Filters } from '@/components/admin/audit-log-filters'

const ITEMS_PER_PAGE = 20

interface AuditLog {
  id: string
  actor_id: string | null
  action: string
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export default function AdminAuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    actionType: 'all',
    startDate: undefined,
    endDate: undefined,
  })

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

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">Track platform activities and events</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Recent activities across the platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuditLogFilters onFilterChange={handleFilterChange} />

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="relative w-full overflow-auto rounded-md border">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Timestamp
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Actor
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Action
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Target
                      </th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="h-24 text-center">
                          No audit logs found.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-b transition-colors hover:bg-muted/50"
                        >
                          <td className="p-4 align-middle">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-4 align-middle">
                            <Badge variant="outline" className="font-mono text-xs">
                              {log.actor_id?.slice(0, 8) || 'System'}
                            </Badge>
                          </td>
                          <td className="p-4 align-middle">
                            <span className="font-medium">{log.action}</span>
                          </td>
                          <td className="p-4 align-middle">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {log.target_id?.slice(0, 8) || '-'}
                            </Badge>
                          </td>
                          <td className="p-4 align-middle">
                            <span className="text-muted-foreground text-xs">
                              {log.metadata
                                ? JSON.stringify(log.metadata).slice(0, 50)
                                : '-'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                    {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} logs
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
