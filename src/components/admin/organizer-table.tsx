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
import { ArrowUpDown, Loader2 } from 'lucide-react'
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
  { bg: 'bg-[#a078ff]/20', text: 'text-[#d0bcff]' },
  { bg: 'bg-[#4cd7f6]/20', text: 'text-[#4cd7f6]' },
  { bg: 'bg-[#4edea3]/20', text: 'text-[#4edea3]' },
  { bg: 'bg-[#ffb4ab]/20', text: 'text-[#ffb4ab]' },
  { bg: 'bg-[#d0bcff]/20', text: 'text-[#d0bcff]' },
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
    return { label: 'Inactive', color: 'text-[#958ea0] bg-[#958ea0]/10 border-[#958ea0]/20', dot: 'bg-[#958ea0]' }
  }
  if (!organizer.sub_expires_at) {
    return { label: 'Active', color: 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20', dot: 'bg-[#4edea3]' }
  }

  const now = new Date()
  const expires = new Date(organizer.sub_expires_at)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  if (expires <= now) {
    return { label: 'Expired', color: 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20', dot: 'bg-[#ffb4ab]' }
  }
  if (expires <= sevenDaysFromNow) {
    return { label: 'Expiring Soon', color: 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20', dot: 'bg-[#ffb4ab]' }
  }
  return { label: 'Active', color: 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20', dot: 'bg-[#4edea3]' }
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
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#958ea0] hover:text-[#cbc3d7] transition-colors font-inter"
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
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 p-8 text-center text-[#958ea0] font-inter text-[13px]">
        <span className="material-symbols-outlined text-[#d0bcff] text-[32px] animate-pulse block mb-2">
          sync
        </span>
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
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#958ea0] text-[18px]">
            search
          </span>
          <Input
            placeholder="Search by name, slug or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-9 bg-[#201f22] border-[#494454]/40 text-[#e5e1e4] placeholder:text-[#958ea0] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
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
          <SelectTrigger className="w-[160px] bg-[#201f22] border-[#494454]/40 text-[#e5e1e4] text-[13px] rounded-lg focus:ring-1 focus:ring-[#d0bcff]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="bg-[#201f22] border-[#494454]/40 text-[#e5e1e4]">
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
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] text-[13px] font-medium font-inter border border-[#494454]/30 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-[#d0bcff]">download</span>
            Export CSV
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#d0bcff] hover:bg-[#6d3bd7] text-[#3c0091] hover:text-white text-[13px] font-semibold transition-all glow-primary font-inter"
          >
            <span className="material-symbols-outlined text-[18px]">add_business</span>
            Add Organizer
          </button>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#494454]/30">
              <SortHeader label="Organization" sortKeyVal="name" onSort={handleSort} />
              <SortHeader label="Slug" sortKeyVal="slug" onSort={handleSort} />
              <SortHeader label="Email" sortKeyVal="contact_email" onSort={handleSort} />
              <SortHeader label="Status" sortKeyVal="is_active" onSort={handleSort} />
              <SortHeader label="Sub Expires" sortKeyVal="sub_expires_at" onSort={handleSort} />
              <SortHeader label="Created" sortKeyVal="created_at" onSort={handleSort} />
              <th className="py-3 px-4 text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#353437]/30 text-[13px]">
            {paginatedOrganizers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[#958ea0]">
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
                  <tr key={organizer.id} className="hover:bg-[#201f22]/60 transition-colors">
                    {/* Organization */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center ${color.text} font-bold text-[12px] shrink-0 font-jakarta`}
                        >
                          {initials}
                        </div>
                        <span className="text-[#e5e1e4] font-semibold font-jakarta">{organizer.name}</span>
                      </div>
                    </td>

                    {/* Slug */}
                    <td className="py-4 px-4">
                      <span className="text-[#958ea0] font-mono text-[12px]">@{organizer.slug}</span>
                    </td>

                    {/* Email */}
                    <td className="py-4 px-4">
                      <span className="text-[#cbc3d7]">{organizer.contact_email || '—'}</span>
                    </td>

                    {/* Status + Toggle */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={organizer.is_active}
                          onCheckedChange={() => onToggleActive(organizer)}
                          className="data-[state=checked]:bg-[#a078ff]"
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
                            className="w-36 h-8 text-xs bg-[#201f22] border-[#494454]/40 text-[#e5e1e4] focus:ring-1 focus:ring-[#d0bcff]"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-[#958ea0] hover:text-[#ffb4ab]"
                            onClick={() => setEditingExpiry(null)}
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-left text-[#cbc3d7] hover:text-[#d0bcff] hover:underline transition-colors font-mono text-[12px] cursor-pointer"
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
                      <span className="text-[#958ea0] font-mono text-[12px]">
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
                          className="p-1.5 rounded-lg bg-[#4cd7f6]/10 hover:bg-[#4cd7f6]/20 text-[#4cd7f6] transition-all border border-[#4cd7f6]/20"
                          title={`Open ${organizer.name} organizer portal`}
                        >
                          <span className="material-symbols-outlined text-[18px]">switch_account</span>
                        </a>

                        <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] hover:text-[#e5e1e4] transition-all border border-[#494454]/30">
                            <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-[#201f22] border border-[#494454]/40 text-[#e5e1e4] rounded-lg shadow-xl"
                        >
                          <DropdownMenuItem
                            className="hover:bg-[#2a2a2c] cursor-pointer text-[13px] focus:bg-[#2a2a2c] focus:text-[#d0bcff]"
                            onClick={() => onEdit(organizer)}
                          >
                            <span className="material-symbols-outlined text-[16px] mr-2 text-[#d0bcff]">edit</span>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-[#ffb4ab] hover:bg-[#93000a]/20 cursor-pointer text-[13px] focus:bg-[#93000a]/20 focus:text-[#ffb4ab]"
                            onClick={() => onDelete(organizer)}
                          >
                            <span className="material-symbols-outlined text-[16px] mr-2">delete</span>
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
          <p className="text-[12px] text-[#958ea0] font-inter">
            Showing{' '}
            <span className="text-[#e5e1e4] font-semibold">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredOrganizers.length)}
            </span>{' '}
            of{' '}
            <span className="text-[#e5e1e4] font-semibold">{filteredOrganizers.length}</span>{' '}
            organizers
          </p>
          <div className="flex items-center gap-1">
            <button
              className="px-3 py-1.5 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] text-[12px] transition-colors border border-[#494454]/30 disabled:opacity-40 disabled:cursor-not-allowed font-inter"
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
                      ? 'bg-[#d0bcff] text-[#3c0091] font-bold'
                      : 'bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] border border-[#494454]/30'
                  }`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            })}
            <button
              className="px-3 py-1.5 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] text-[12px] transition-colors border border-[#494454]/30 disabled:opacity-40 disabled:cursor-not-allowed font-inter"
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
