'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Users, UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OrganizerTable } from '@/components/admin/organizer-table'
import { ApplicantTable } from '@/components/admin/applicant-table'
import { OrganizerFormDialog } from '@/components/admin/organizer-form'
import type { Organizer } from '@/components/admin/types'
import { logAudit } from '@/lib/audit'

const supabase = createClient()

export default function AdminOrganizersPage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [applicants, setApplicants] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedOrganizer, setSelectedOrganizer] = useState<Organizer | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function fetchOrganizers() {
      const { data } = await supabase
        .from('organizers')
        .select('*')
        .order('created_at', { ascending: false })
      if (data) {
        // Organizer table: all approved or admin-created organizers (active + inactive)
        const allOrganizers = data.filter(
          (org) => org.approved_at || org.is_active === true
        )
        // Pending: only true new applicants (never approved, not rejected, inactive)
        const pending = data.filter(
          (org) => org.is_active === false && !org.approved_at && !org.rejected_at
        )
        setOrganizers(allOrganizers)
        setApplicants(pending)
      }
      setLoading(false)
    }
    fetchOrganizers()
  }, [])

  const handleCreate = (organizer: Organizer) => {
    setOrganizers((prev) => [organizer, ...prev])
  }

  const handleUpdate = (organizer: Organizer) => {
    setOrganizers((prev) =>
      prev.map((o) => (o.id === organizer.id ? organizer : o))
    )
  }

  const handleEdit = (organizer: Organizer) => {
    setSelectedOrganizer(organizer)
    setEditOpen(true)
  }

  const handleDelete = (organizer: Organizer) => {
    setSelectedOrganizer(organizer)
    setDeleteOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedOrganizer) return
    setDeleting(true)

    const { error } = await supabase
      .from('organizers')
      .delete()
      .eq('id', selectedOrganizer.id)

    if (!error) {
      await logAudit(supabase, 'admin_delete_organizer', selectedOrganizer.id, {
        name: selectedOrganizer.name,
        email: selectedOrganizer.contact_email,
      })
      setOrganizers((prev) => prev.filter((o) => o.id !== selectedOrganizer.id))
      setApplicants((prev) => prev.filter((o) => o.id !== selectedOrganizer.id))
    }
    setDeleting(false)
    setDeleteOpen(false)
    setSelectedOrganizer(null)
  }

  const handleToggleActive = async (organizer: Organizer) => {
    const { error } = await supabase
      .from('organizers')
      .update({ is_active: !organizer.is_active })
      .eq('id', organizer.id)

    if (!error) {
      const updated = { ...organizer, is_active: !organizer.is_active }
      await logAudit(supabase, updated.is_active ? 'admin_activate_organizer' : 'admin_deactivate_organizer', organizer.id, {
        name: organizer.name,
        previous_state: { is_active: organizer.is_active },
        new_state: { is_active: updated.is_active },
      })
      if (updated.is_active) {
        // Was inactive, now active
        setApplicants((prev) => prev.filter((o) => o.id !== updated.id))
        setOrganizers((prev) => {
          const exists = prev.some((o) => o.id === updated.id)
          return exists
            ? prev.map((o) => (o.id === updated.id ? updated : o))
            : [updated, ...prev]
        })
      } else {
        // Was active, now inactive — stays in organizers table (has approved_at)
        setOrganizers((prev) =>
          prev.map((o) => (o.id === updated.id ? updated : o))
        )
      }
    }
  }

  const handleApprove = async (applicant: Organizer) => {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('organizers')
      .update({ is_active: true, approved_at: now })
      .eq('id', applicant.id)

    if (!error) {
      const approved = { ...applicant, is_active: true, approved_at: now }
      await logAudit(supabase, 'admin_approve_organizer', applicant.id, {
        name: applicant.name,
        email: applicant.contact_email,
      })
      setApplicants((prev) => prev.filter((o) => o.id !== approved.id))
      setOrganizers((prev) => [approved, ...prev])
    }
  }

  const handleReject = async (applicant: Organizer) => {
    const { error } = await supabase
      .from('organizers')
      .update({ rejected_at: new Date().toISOString() })
      .eq('id', applicant.id)

    if (!error) {
      await logAudit(supabase, 'admin_reject_organizer', applicant.id, {
        name: applicant.name,
        email: applicant.contact_email,
      })
      setApplicants((prev) => prev.filter((o) => o.id !== applicant.id))
    }
  }

  const handleDeleteApplicant = async (applicant: Organizer) => {
    const { error } = await supabase
      .from('organizers')
      .delete()
      .eq('id', applicant.id)

    if (!error) {
      await logAudit(supabase, 'admin_delete_applicant', applicant.id, {
        name: applicant.name,
        email: applicant.contact_email,
      })
      setApplicants((prev) => prev.filter((o) => o.id !== applicant.id))
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizers</h1>
          <p className="text-muted-foreground">
            Manage event organizers and applications on the platform
          </p>
        </div>
      </div>

      <OrganizerFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreate}
        trigger={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Organizer
          </Button>
        }
      />

      <OrganizerFormDialog
        organizer={selectedOrganizer}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={handleUpdate}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organizer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{selectedOrganizer?.name}</strong>? This will also delete
              all their events, registrations, and data. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Organizer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Organizers Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold tracking-tight">
            Organizers
          </h2>
          <Badge variant="secondary" className="ml-2">
            {organizers.length}
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <OrganizerTable
            organizers={organizers}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onAdd={() => setCreateOpen(true)}
          />
        )}

        {!loading && organizers.length === 0 && (
          <Card className="border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No organizers yet</p>
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first organizer
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending Applications Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold tracking-tight">
            Pending Applications
          </h2>
          <Badge variant="secondary" className="ml-2">
            {applicants.length}
          </Badge>
        </div>

        <ApplicantTable
          applicants={applicants}
          loading={loading}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDeleteApplicant}
        />
      </div>
    </div>
  )
}
