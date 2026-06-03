'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Download } from 'lucide-react'
import { exportRegistrationsCsv } from '@/components/events/actions'

type Registration = {
  id: string
  bib_number: string
  checked_in: boolean
  payment_status: string
  runner_profiles: { full_name: string; phone: string } | null
  race_categories: { name: string } | null
}

export function RegistrationsClient({
  eventName,
  registrations,
  stats,
}: {
  eventName: string
  registrations: Registration[]
  stats: { total: number; checkedIn: number; paid: number }
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked_in' | 'not_checked' | 'paid' | 'pending'>('all')

  const filtered = useMemo(() => {
    return registrations.filter((reg) => {
      const query = searchQuery.toLowerCase()
      const matchesSearch =
        !query ||
        reg.bib_number.toLowerCase().includes(query) ||
        (reg.runner_profiles?.full_name || '').toLowerCase().includes(query) ||
        (reg.race_categories?.name || '').toLowerCase().includes(query) ||
        (reg.runner_profiles?.phone || '').includes(query)

      const matchesFilter =
        statusFilter === 'all' ||
        (statusFilter === 'checked_in' && reg.checked_in) ||
        (statusFilter === 'not_checked' && !reg.checked_in) ||
        (statusFilter === 'paid' && reg.payment_status === 'paid') ||
        (statusFilter === 'pending' && reg.payment_status === 'pending')

      return matchesSearch && matchesFilter
    })
  }, [registrations, searchQuery, statusFilter])

  const handleExport = async () => {
    const csv = await exportRegistrationsCsv(filtered)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${eventName.replace(/\s+/g, '-')}-registrations.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Registrations</h1>
          <p className="text-muted-foreground">All registrations for {eventName}</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.checkedIn}</div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paid}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All Registrations</CardTitle>
              <CardDescription>Complete list of registered runners</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search BIB, name, category..."
                  className="pl-9 w-full sm:w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              >
                <option value="all">All</option>
                <option value="checked_in">Checked In</option>
                <option value="not_checked">Not Checked</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>BIB</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell className="font-mono">{reg.bib_number}</TableCell>
                    <TableCell className="font-medium">
                      {reg.runner_profiles?.full_name || 'Unknown'}
                    </TableCell>
                    <TableCell>{reg.race_categories?.name || '-'}</TableCell>
                    <TableCell>{reg.runner_profiles?.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={reg.payment_status === 'paid' ? 'default' : 'secondary'}
                      >
                        {reg.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={reg.checked_in ? 'default' : 'outline'}
                      >
                        {reg.checked_in ? 'Checked In' : 'Not Yet'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              {searchQuery || statusFilter !== 'all'
                ? 'No registrations match your filters'
                : 'No registrations yet'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
