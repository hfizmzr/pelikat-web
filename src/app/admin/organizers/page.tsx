'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Loader2, Plus, Store, Trash2, UserPlus } from "lucide-react"
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
        setApplicants((prev) => prev.filter((o) => o.id !== updated.id))
        setOrganizers((prev) => {
          const exists = prev.some((o) => o.id === updated.id)
          return exists
            ? prev.map((o) => (o.id === updated.id ? updated : o))
            : [updated, ...prev]
        })
      } else {
        setOrganizers((prev) =>
          prev.map((o) => (o.id === updated.id ? updated : o))
        )
      }
    }
  }

  const handleUpdateSubExpiry = async (organizer: Organizer, subExpiresAt: string) => {
    const expiryDate = subExpiresAt
      ? new Date(subExpiresAt).toISOString()
      : null

    const { error } = await supabase
      .from('organizers')
      .update({ sub_expires_at: expiryDate })
      .eq('id', organizer.id)

    if (!error) {
      await logAudit(supabase, 'admin_update_subscription', organizer.id, {
        name: organizer.name,
        previous_expiry: organizer.sub_expires_at,
        new_expiry: expiryDate,
      })
      setOrganizers((prev) =>
        prev.map((o) =>
          o.id === organizer.id ? { ...o, sub_expires_at: expiryDate } : o
        )
      )
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
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="size-[16px] text-primary"><Building2 className="size-[16px] text-primary" /></span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary font-inter">
              Tenant Directory
            </span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] leading-tight tracking-tight text-foreground">
            Organizers
          </h1>
          <p className="text-[13px] text-muted-foreground font-inter">
            Manage event organizers, tenant accounts, and applications on the platform
          </p>
        </div>
      </div>

      <OrganizerFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={handleCreate}
        trigger={
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary text-primary-foreground hover:text-white text-[13px] font-semibold transition-all glow-primary font-inter"
          >
            <span className="size-[18px]"><Store className="size-[18px]" /></span>
            Add Organizer
          </button>
        }
      />

      <OrganizerFormDialog
        organizer={selectedOrganizer}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={handleUpdate}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-card border border-border/40 text-foreground rounded-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-[18px] text-foreground flex items-center gap-2">
              <span className="size-[20px] text-red-300"><Trash2 className="size-[20px] text-red-300" /></span>
              Delete Organizer
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-inter text-[13px]">
              Are you sure you want to delete{' '}
              <strong className="text-foreground">{selectedOrganizer?.name}</strong>? This will also
              delete all their events, registrations, and data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent text-foreground text-[13px] font-medium font-inter transition-colors border border-border/30"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-800/20 hover:bg-red-800/40 text-red-300 text-[13px] font-semibold font-inter transition-colors border border-red-300/20 disabled:opacity-50"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span className="size-[18px]"><Trash2 className="size-[18px]" /></span>
              Delete Organizer
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Active Organizers Section ─────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="size-[20px] text-primary"><Building2 className="size-[20px] text-primary" /></span>
          <h2 className="font-jakarta font-semibold text-[18px] text-foreground tracking-tight">
            Active Organizers
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold border border-primary/20 font-inter">
            {organizers.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : (
          <OrganizerTable
            organizers={organizers}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onUpdateSubExpiry={handleUpdateSubExpiry}
            onAdd={() => setCreateOpen(true)}
          />
        )}

        {!loading && organizers.length === 0 && (
          <div className="rounded-xl bg-card border border-border/30 flex flex-col items-center justify-center py-12 gap-3">
            <span className="size-[40px] text-border"><Building2 className="size-[40px] text-border" /></span>
            <p className="text-muted-foreground font-inter text-[13px]">No organizers yet</p>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-card hover:bg-accent text-primary text-[13px] font-medium font-inter border border-border/30 transition-colors"
              onClick={() => setCreateOpen(true)}
            >
              <span className="size-[18px]"><Plus className="size-[18px]" /></span>
              Create your first organizer
            </button>
          </div>
        )}
      </div>

      {/* ── Pending Applications Section ─────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="size-[20px] text-primary"><UserPlus className="size-[20px] text-primary" /></span>
          <h2 className="font-jakarta font-semibold text-[18px] text-foreground tracking-tight">
            Pending Applications
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold border border-primary/20 font-inter">
            {applicants.length}
          </span>
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
