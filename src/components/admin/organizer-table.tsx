'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
import { ArrowUpDown, Download, MoreHorizontal, Pencil, RefreshCw, Search, Store, Trash2, UserCog, X } from "lucide-react"
import type { Organizer } from './types'

// ─── CSV export helper ────────────────────────────────────────────────────────
function exportOrganizersCSV(organizers: Organizer[]) {
  const headers = ['Name', 'Slug', 'Email', 'Active', 'Subscription Expires', 'Created']
  const rows = organizers.map((o) => [
    o.name,
    o.slug,
    o.contact_email || '',
    o.is_active ? 'Yes' : 'No',
    o.sub_expires_at ? new Date(o.sub_expires_at).toLocaleDateString() : '',
    new Date(o.created_at).toLocaleDateString(),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`))

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `organizers-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

interface OrganizerTableProps {
  organizers: Organizer[]
  loading: boolean
  onEdit: (organizer: Organizer) => void
  onDelete: (organizer: Organizer) => void
  onToggleActive: (organizer: Organizer) => void
  onUpdateSubExpiry: (organizer: Organizer, subExpiresAt: string) => void
  onAdd: () => void
}

type SortKey = 'name' | 'slug' | 'contact_email' | 'is_active' | 'sub_expires_at' | 'created_at'
type SortDirection = 'asc' | 'desc'
type StatusFilter = 'all' | 'active' | 'inactive' | 'expiring' | 'expired'

const ITEMS_PER_PAGE = 25

// ─── Color palette for organizer initials ────────────────────────────────────
const ORG_COLORS = [
  { bg: 'bg-primary/20', text: 'text-primary' },
  { bg: 'bg-primary/20', text: 'text-primary' },
  { bg: 'bg-success/20', text: 'text-success' },
  { bg: 'bg-red-500/10 dark:bg-red-300/20', text: 'text-red-500 dark:text-red-300' },
  { bg: 'bg-primary/20', text: 'text-primary' },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getSubscriptionStatus(organizer: Organizer) {
  if (!organizer.is_active) {
    return { label: 'Inactive', color: 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20', dot: 'bg-muted-foreground' }
  }
  if (!organizer.sub_expires_at) {
    return { label: 'Active', color: 'text-success bg-success/10 border-success/20', dot: 'bg-success' }
  }

  const now = new Date()
  const expires = new Date(organizer.sub_expires_at)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  if (expires <= now) {
    return { label: 'Expired', color: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/10 border-red-500/30 dark:border-red-300/20', dot: 'bg-red-500 dark:bg-red-300' }
  }
  if (expires <= sevenDaysFromNow) {
    return { label: 'Expiring Soon', color: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/10 border-red-500/30 dark:border-red-300/20', dot: 'bg-red-500 dark:bg-red-300' }
  }
  return { label: 'Active', color: 'text-success bg-success/10 border-success/20', dot: 'bg-success' }
}

// ─── Sort column header ───────────────────────────────────────────────────────
function SortHeader({
  label,
  sortKeyVal,
  onSort,
}: {
  label: string
  sortKeyVal: SortKey
  onSort: (key: SortKey) => void
}) {
  return (
    <th className="py-3 px-4">
      <button
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-muted-foreground transition-colors font-inter"
        onClick={() => onSort(sortKeyVal)}
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function OrganizerTable({
  organizers,
  loading,
  onEdit,
  onDelete,
  onToggleActive,
  onUpdateSubExpiry,
  onAdd,
}: OrganizerTableProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [editingExpiry, setEditingExpiry] = useState<string | null>(null)
  const [editingExpiryValue, setEditingExpiryValue] = useState('')
  const expiryInputRef = useRef<HTMLInputElement>(null)

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

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDirection('asc')
      }
      setCurrentPage(1)
    },
    [sortKey]
  )

  useEffect(() => {
    if (editingExpiry && expiryInputRef.current) {
      expiryInputRef.current.focus()
    }
  }, [editingExpiry])

  if (loading) {
    return (
      <div className="rounded-xl bg-card border border-border/30 p-8 text-center text-muted-foreground font-inter text-[13px]">
        <RefreshCw className="text-primary size-[32px] animate-pulse block mb-2" />
        Loading organizers...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 font-inter">
      {/* ── Filters & Search ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 text-muted-foreground size-[18px]" />
          <Input
            placeholder="Search by name, slug or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-9 bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
          />
        </div>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter)
            setCurrentPage(1)
          }}
        >
          <SelectTrigger className="w-[160px] bg-card border-border/40 text-foreground text-[13px] rounded-lg focus:ring-1 focus:ring-primary">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border/40 text-foreground">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        {/* Add + Export buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => exportOrganizersCSV(filteredOrganizers)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-card hover:bg-accent text-muted-foreground text-[13px] font-medium font-inter border border-border/30 transition-colors"
          >
            <Download className="size-[18px] text-primary" />
            Export CSV
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground hover:text-white text-[13px] font-semibold transition-all font-inter"
          >
            <Store className="size-[18px]" />
            Add Organizer
          </button>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/30">
              <SortHeader label="Organization" sortKeyVal="name" onSort={handleSort} />
              <SortHeader label="Slug" sortKeyVal="slug" onSort={handleSort} />
              <SortHeader label="Email" sortKeyVal="contact_email" onSort={handleSort} />
              <SortHeader label="Status" sortKeyVal="is_active" onSort={handleSort} />
              <SortHeader label="Sub Expires" sortKeyVal="sub_expires_at" onSort={handleSort} />
              <SortHeader label="Created" sortKeyVal="created_at" onSort={handleSort} />
              <th className="py-3 px-4 text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-accent/30 text-[13px]">
            {paginatedOrganizers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  No organizers match your search.
                </td>
              </tr>
            ) : (
              paginatedOrganizers.map((organizer, i) => {
                const subStatus = getSubscriptionStatus(organizer)
                const isEditingExpiry = editingExpiry === organizer.id
                const color = ORG_COLORS[(i + (currentPage - 1) * ITEMS_PER_PAGE) % ORG_COLORS.length]
                const initials = getInitials(organizer.name)

                return (
                  <tr key={organizer.id} className="hover:bg-card/60 transition-colors">
                    {/* Organization */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center ${color.text} font-bold text-[12px] shrink-0 font-jakarta`}
                        >
                          {initials}
                        </div>
                        <span className="text-foreground font-semibold font-jakarta">{organizer.name}</span>
                      </div>
                    </td>

                    {/* Slug */}
                    <td className="py-4 px-4">
                      <span className="text-muted-foreground font-mono text-[12px]">@{organizer.slug}</span>
                    </td>

                    {/* Email */}
                    <td className="py-4 px-4">
                      <span className="text-muted-foreground">{organizer.contact_email || '—'}</span>
                    </td>

                    {/* Status + Toggle */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={organizer.is_active}
                          onCheckedChange={() => onToggleActive(organizer)}
                          className="data-[state=checked]:bg-primary"
                        />
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 border ${subStatus.color}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${subStatus.dot}`} />
                          {subStatus.label}
                        </span>
                      </div>
                    </td>

                    {/* Expiry */}
                    <td className="py-4 px-4">
                      {isEditingExpiry ? (
                        <div className="flex items-center gap-1">
                          <Input
                            ref={expiryInputRef}
                            type="date"
                            value={editingExpiryValue}
                            onChange={(e) => setEditingExpiryValue(e.target.value)}
                            onBlur={() => {
                              if (editingExpiryValue) {
                                onUpdateSubExpiry(organizer, editingExpiryValue)
                              }
                              setEditingExpiry(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editingExpiryValue) {
                                  onUpdateSubExpiry(organizer, editingExpiryValue)
                                }
                                setEditingExpiry(null)
                              }
                              if (e.key === 'Escape') {
                                setEditingExpiry(null)
                              }
                            }}
                            className="w-36 h-8 text-xs bg-card border-border/40 text-foreground focus:ring-1 focus:ring-primary"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-500 dark:text-red-300"
                            onClick={() => setEditingExpiry(null)}
                          >
                            <X className="size-[16px]" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-left text-muted-foreground hover:text-primary hover:underline transition-colors font-mono text-[12px] cursor-pointer"
                          onClick={() => {
                            const dateStr = organizer.sub_expires_at
                              ? new Date(organizer.sub_expires_at).toISOString().split('T')[0]
                              : ''
                            setEditingExpiryValue(dateStr)
                            setEditingExpiry(organizer.id)
                          }}
                        >
                          {organizer.sub_expires_at
                            ? new Date(organizer.sub_expires_at).toLocaleDateString()
                            : '—'}
                        </button>
                      )}
                    </td>

                    {/* Created */}
                    <td className="py-4 px-4">
                      <span className="text-muted-foreground font-mono text-[12px]">
                        {new Date(organizer.created_at).toLocaleDateString()}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Impersonate / Open portal */}
                        <a
                          href={`/organizer`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all border border-primary/20"
                          title={`Open ${organizer.name} organizer portal`}
                        >
                          <UserCog className="size-[18px]" />
                        </a>

                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-lg bg-card hover:bg-accent text-muted-foreground hover:text-foreground transition-all border border-border/30">
                            <MoreHorizontal className="size-[18px]" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-card border border-border/40 text-foreground rounded-lg shadow-xl"
                        >
                          <DropdownMenuItem
                            className="hover:bg-accent cursor-pointer text-[13px] focus:bg-accent focus:text-primary"
                            onClick={() => onEdit(organizer)}
                          >
                            <Pencil className="size-[16px] mr-2 text-primary" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-500 dark:text-red-300 hover:bg-red-800/20 cursor-pointer text-[13px] focus:bg-red-800/20 focus:text-red-500 dark:text-red-300"
                            onClick={() => onDelete(organizer)}
                          >
                            <Trash2 className="size-[16px] mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <p className="text-[12px] text-muted-foreground font-inter">
            Showing{' '}
            <span className="text-foreground font-semibold">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredOrganizers.length)}
            </span>{' '}
            of{' '}
            <span className="text-foreground font-semibold">{filteredOrganizers.length}</span>{' '}
            organizers
          </p>
          <div className="flex items-center gap-1">
            <button
              className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent text-muted-foreground text-[12px] transition-colors border border-border/30 disabled:opacity-40 disabled:cursor-not-allowed font-inter"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, j) => {
              const page = j + 1
              return (
                <button
                  key={page}
                  className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors font-inter ${
                    currentPage === page
                      ? 'bg-primary text-primary-foreground font-bold'
                      : 'bg-card hover:bg-accent text-muted-foreground border border-border/30'
                  }`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            })}
            <button
              className="px-3 py-1.5 rounded-lg bg-card hover:bg-accent text-muted-foreground text-[12px] transition-colors border border-border/30 disabled:opacity-40 disabled:cursor-not-allowed font-inter"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
