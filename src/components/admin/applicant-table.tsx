'use client'

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowUpDown } from 'lucide-react'
import type { Organizer } from './types'

interface ApplicantTableProps {
  applicants: Organizer[]
  loading: boolean
  onApprove: (applicant: Organizer) => void
  onReject: (applicant: Organizer) => void
  onDelete: (applicant: Organizer) => void
}

type SortKey = 'name' | 'contact_email' | 'created_at'
type SortDirection = 'asc' | 'desc'

const ITEMS_PER_PAGE = 25

// ─── Obsidian Velocity applicant color palette ───────────────────────────────
const APPLICANT_COLORS = [
  { bg: 'bg-[#4cd7f6]/20', text: 'text-[#4cd7f6]' },
  { bg: 'bg-[#4edea3]/20', text: 'text-[#4edea3]' },
  { bg: 'bg-[#d0bcff]/20', text: 'text-[#d0bcff]' },
  { bg: 'bg-[#ffb4ab]/20', text: 'text-[#ffb4ab]' },
]

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

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

export function ApplicantTable({
  applicants,
  loading,
  onApprove,
  onReject,
  onDelete,
}: ApplicantTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedApplicant, setSelectedApplicant] = useState<Organizer | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const sortedApplicants = useMemo(() => {
    const sorted = [...applicants]
    sorted.sort((a, b) => {
      let aVal: string | null = a[sortKey]
      let bVal: string | null = b[sortKey]
      if (aVal === null) aVal = ''
      if (bVal === null) bVal = ''
      const comparison = String(aVal).localeCompare(String(bVal))
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [applicants, sortKey, sortDirection])

  const totalPages = Math.ceil(sortedApplicants.length / ITEMS_PER_PAGE)
  const paginatedApplicants = sortedApplicants.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const handleRejectClick = (applicant: Organizer) => {
    setSelectedApplicant(applicant)
    setRejectDialogOpen(true)
  }

  const handleDeleteClick = (applicant: Organizer) => {
    setSelectedApplicant(applicant)
    setDeleteDialogOpen(true)
  }

  const confirmReject = () => {
    if (selectedApplicant) {
      onReject(selectedApplicant)
      setRejectDialogOpen(false)
      setSelectedApplicant(null)
    }
  }

  const confirmDelete = () => {
    if (selectedApplicant) {
      onDelete(selectedApplicant)
      setDeleteDialogOpen(false)
      setSelectedApplicant(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 p-8 text-center text-[#958ea0] font-inter text-[13px]">
        <span className="material-symbols-outlined text-[#4cd7f6] text-[32px] animate-pulse block mb-2">
          person_search
        </span>
        Loading applicants...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 font-inter">
      {/* ── Reject Dialog ─────────────────────────────────────────────── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-[#201f22] border border-[#494454]/40 text-[#e5e1e4] rounded-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-[18px] text-[#e5e1e4] flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#ffb4ab]">cancel</span>
              Reject Application
            </DialogTitle>
            <DialogDescription className="text-[#cbc3d7] font-inter text-[13px]">
              Are you sure you want to reject{' '}
              <strong className="text-[#e5e1e4]">{selectedApplicant?.name}</strong>? This will mark
              the application as rejected but keep the record in the database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 rounded-lg bg-[#2a2a2c] hover:bg-[#353437] text-[#e5e1e4] text-[13px] font-medium font-inter transition-colors border border-[#494454]/30"
              onClick={() => setRejectDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#93000a]/20 hover:bg-[#93000a]/40 text-[#ffb4ab] text-[13px] font-semibold font-inter transition-colors border border-[#ffb4ab]/20"
              onClick={confirmReject}
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
              Reject
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#201f22] border border-[#494454]/40 text-[#e5e1e4] rounded-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-[18px] text-[#e5e1e4] flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#ffb4ab]">delete_forever</span>
              Delete Application
            </DialogTitle>
            <DialogDescription className="text-[#cbc3d7] font-inter text-[13px]">
              Are you sure you want to permanently delete{' '}
              <strong className="text-[#e5e1e4]">{selectedApplicant?.name}</strong>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 rounded-lg bg-[#2a2a2c] hover:bg-[#353437] text-[#e5e1e4] text-[13px] font-medium font-inter transition-colors border border-[#494454]/30"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#93000a]/20 hover:bg-[#93000a]/40 text-[#ffb4ab] text-[13px] font-semibold font-inter transition-colors border border-[#ffb4ab]/20"
              onClick={confirmDelete}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#494454]/30">
              <SortHeader label="Applicant" sortKeyVal="name" onSort={handleSort} />
              <SortHeader label="Email" sortKeyVal="contact_email" onSort={handleSort} />
              <SortHeader label="Applied" sortKeyVal="created_at" onSort={handleSort} />
              <th className="py-3 px-4 text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#958ea0]">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#353437]/30 text-[13px]">
            {paginatedApplicants.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-[#958ea0]">
                  <span className="material-symbols-outlined text-[32px] block mb-2 text-[#494454]">
                    inbox
                  </span>
                  No pending applications.
                </td>
              </tr>
            ) : (
              paginatedApplicants.map((applicant, i) => {
                const color = APPLICANT_COLORS[i % APPLICANT_COLORS.length]
                const initials = getInitials(applicant.name)
                return (
                  <tr key={applicant.id} className="hover:bg-[#201f22]/60 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center ${color.text} font-bold text-[12px] shrink-0 font-jakarta`}
                        >
                          {initials}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[#e5e1e4] font-semibold font-jakarta">{applicant.name}</span>
                          <span className="text-[11px] text-[#958ea0] font-mono">@{applicant.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-[#cbc3d7]">{applicant.contact_email || '—'}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-[#958ea0] font-mono text-[12px]">
                        {new Date(applicant.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Approve */}
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4edea3]/10 hover:bg-[#4edea3]/20 text-[#4edea3] text-[12px] font-semibold transition-colors border border-[#4edea3]/20 font-inter"
                          onClick={() => onApprove(applicant)}
                        >
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          Approve
                        </button>
                        {/* Reject */}
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ffb4ab]/10 hover:bg-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] font-semibold transition-colors border border-[#ffb4ab]/20 font-inter"
                          onClick={() => handleRejectClick(applicant)}
                        >
                          <span className="material-symbols-outlined text-[16px]">cancel</span>
                          Reject
                        </button>
                        {/* Delete */}
                        <button
                          className="p-1.5 rounded-lg bg-[#201f22] hover:bg-[#93000a]/20 text-[#958ea0] hover:text-[#ffb4ab] transition-colors border border-[#494454]/30"
                          onClick={() => handleDeleteClick(applicant)}
                          title="Delete application"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
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
              {Math.min(currentPage * ITEMS_PER_PAGE, sortedApplicants.length)}
            </span>{' '}
            of{' '}
            <span className="text-[#e5e1e4] font-semibold">{sortedApplicants.length}</span>{' '}
            applicants
          </p>
          <div className="flex items-center gap-1">
            <button
              className="px-3 py-1.5 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#cbc3d7] text-[12px] transition-colors border border-[#494454]/30 disabled:opacity-40 disabled:cursor-not-allowed font-inter"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </button>
            <span className="px-3 text-[12px] text-[#cbc3d7] font-inter">
              Page {currentPage} of {totalPages}
            </span>
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
