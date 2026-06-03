'use client'

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle, XCircle, Trash2, ArrowUpDown } from 'lucide-react'
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
      <div className="rounded-md border">
        <div className="p-8 text-center text-muted-foreground">Loading applicants...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject{' '}
              <strong>{selectedApplicant?.name}</strong>? This will mark the
              application as rejected but keep the record in the database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Application</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{' '}
              <strong>{selectedApplicant?.name}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="Name" sortKeyVal="name" onSort={handleSort} />
              <SortHeader label="Email" sortKeyVal="contact_email" onSort={handleSort} />
              <SortHeader label="Applied" sortKeyVal="created_at" onSort={handleSort} />
              <TableHead className="w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedApplicants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No pending applications.
                </TableCell>
              </TableRow>
            ) : (
              paginatedApplicants.map((applicant) => (
                <TableRow key={applicant.id}>
                  <TableCell className="font-medium">{applicant.name}</TableCell>
                  <TableCell>{applicant.contact_email || '-'}</TableCell>
                  <TableCell>
                    {new Date(applicant.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-success hover:bg-success/90"
                        onClick={() => onApprove(applicant)}
                      >
                        <CheckCircle className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive hover:bg-destructive/10"
                        onClick={() => handleRejectClick(applicant)}
                      >
                        <XCircle className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteClick(applicant)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, sortedApplicants.length)} of{' '}
            {sortedApplicants.length} applicants
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
