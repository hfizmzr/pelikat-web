'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Pencil, Trash2, MoreHorizontal, ArrowUpDown, Search } from 'lucide-react'
import type { Organizer } from './types'

interface OrganizerTableProps {
  organizers: Organizer[]
  loading: boolean
  onEdit: (organizer: Organizer) => void
  onDelete: (organizer: Organizer) => void
  onToggleActive: (organizer: Organizer) => void
  onAdd: () => void
}

type SortKey = 'name' | 'slug' | 'contact_email' | 'is_active' | 'sub_expires_at' | 'created_at'
type SortDirection = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'inactive' | 'expiring' | 'expired'

const ITEMS_PER_PAGE = 25

interface SortHeaderProps {
  label: string
  sortKeyVal: SortKey
  onSort: (key: SortKey) => void
}

function SortHeader({ label, sortKeyVal, onSort }: SortHeaderProps) {
  return (
    <TableHead>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
        onClick={() => onSort(sortKeyVal)}
      >
        {label}
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    </TableHead>
  )
}

export function OrganizerTable({
  organizers,
  loading,
  onEdit,
  onDelete,
  onToggleActive,
  onAdd,
}: OrganizerTableProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)

  const filteredOrganizers = useMemo(() => {
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const filtered = organizers.filter((org) => {
      const searchLower = search.toLowerCase()
      const matchesSearch =
        !search ||
        org.name.toLowerCase().includes(searchLower) ||
        org.slug.toLowerCase().includes(searchLower) ||
        (org.contact_email && org.contact_email.toLowerCase().includes(searchLower))

      let matchesStatus = true
      if (statusFilter === 'active') {
        matchesStatus = org.is_active && (!org.sub_expires_at || new Date(org.sub_expires_at) > now)
      } else if (statusFilter === 'inactive') {
        matchesStatus = !org.is_active
      } else if (statusFilter === 'expiring') {
        matchesStatus = !!(
          org.is_active &&
          org.sub_expires_at &&
          new Date(org.sub_expires_at) <= sevenDaysFromNow &&
          new Date(org.sub_expires_at) > now
        )
      } else if (statusFilter === 'expired') {
        matchesStatus = !!(
          org.is_active && org.sub_expires_at && new Date(org.sub_expires_at) <= now
        )
      }

      return matchesSearch && matchesStatus
    })

    filtered.sort((a, b) => {
      let aVal: string | boolean | null = a[sortKey]
      let bVal: string | boolean | null = b[sortKey]

      if (aVal === null) aVal = ''
      if (bVal === null) bVal = ''

      if (typeof aVal === 'boolean') {
        return sortDirection === 'asc'
          ? Number(aVal) - Number(bVal)
          : Number(bVal) - Number(aVal)
      }

      const comparison = String(aVal).localeCompare(String(bVal))
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [organizers, search, statusFilter, sortKey, sortDirection])

  const totalPages = Math.ceil(filteredOrganizers.length / ITEMS_PER_PAGE)
  const paginatedOrganizers = filteredOrganizers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }, [sortKey])

  const getSubscriptionStatus = (organizer: Organizer) => {
    if (!organizer.is_active) {
      return { label: 'Inactive', variant: 'secondary' as const }
    }
    if (!organizer.sub_expires_at) {
      return { label: 'Active', variant: 'default' as const }
    }

    const now = new Date()
    const expires = new Date(organizer.sub_expires_at)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    if (expires <= now) {
      return { label: 'Expired', variant: 'destructive' as const }
    }
    if (expires <= sevenDaysFromNow) {
      return { label: 'Expiring Soon', variant: 'warning' as const }
    }
    return { label: 'Active', variant: 'default' as const }
  }

  if (loading) {
    return (
      <div className="rounded-md border">
        <div className="p-8 text-center text-muted-foreground">Loading organizers...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organizers..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-8"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter)
            setCurrentPage(1)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={onAdd}>Add Organizer</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader
                label="Name"
                sortKeyVal="name"
                onSort={handleSort}
              />
              <SortHeader
                label="Slug"
                sortKeyVal="slug"
                onSort={handleSort}
              />
              <SortHeader
                label="Email"
                sortKeyVal="contact_email"
                onSort={handleSort}
              />
              <SortHeader
                label="Status"
                sortKeyVal="is_active"
                onSort={handleSort}
              />
              <SortHeader
                label="Expires"
                sortKeyVal="sub_expires_at"
                onSort={handleSort}
              />
              <SortHeader
                label="Created"
                sortKeyVal="created_at"
                onSort={handleSort}
              />
              <TableHead className="w-[70px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrganizers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No organizers found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedOrganizers.map((organizer) => {
                const subStatus = getSubscriptionStatus(organizer)
                return (
                  <TableRow key={organizer.id}>
                    <TableCell className="font-medium">{organizer.name}</TableCell>
                    <TableCell className="font-mono text-sm">@{organizer.slug}</TableCell>
                    <TableCell>{organizer.contact_email || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={subStatus.variant}>{subStatus.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {organizer.sub_expires_at
                        ? new Date(organizer.sub_expires_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {new Date(organizer.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(organizer)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onToggleActive(organizer)}
                          >
                            {organizer.is_active ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onDelete(organizer)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredOrganizers.length)} of{' '}
            {filteredOrganizers.length} organizers
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
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
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
