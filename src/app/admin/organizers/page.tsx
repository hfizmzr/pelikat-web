'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
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
    <div className="flex flex-col gap-8 font-inter text-[#e5e1e4]">
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#d0bcff]">apartment</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d0bcff] font-inter">
              Tenant Directory
            </span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] leading-tight tracking-tight text-[#e5e1e4]">
            Organizers
          </h1>
          <p className="text-[13px] text-[#958ea0] font-inter">
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#d0bcff] hover:bg-[#6d3bd7] text-[#3c0091] hover:text-white text-[13px] font-semibold transition-all glow-primary font-inter"
          >
            <span className="material-symbols-outlined text-[18px]">add_business</span>
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
        <DialogContent className="bg-[#201f22] border border-[#494454]/40 text-[#e5e1e4] rounded-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-[18px] text-[#e5e1e4] flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[#ffb4ab]">delete_forever</span>
              Delete Organizer
            </DialogTitle>
            <DialogDescription className="text-[#cbc3d7] font-inter text-[13px]">
              Are you sure you want to delete{' '}
              <strong className="text-[#e5e1e4]">{selectedOrganizer?.name}</strong>? This will also
              delete all their events, registrations, and data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 rounded-lg bg-[#2a2a2c] hover:bg-[#353437] text-[#e5e1e4] text-[13px] font-medium font-inter transition-colors border border-[#494454]/30"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#93000a]/20 hover:bg-[#93000a]/40 text-[#ffb4ab] text-[13px] font-semibold font-inter transition-colors border border-[#ffb4ab]/20 disabled:opacity-50"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Delete Organizer
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Active Organizers Section ─────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#d0bcff]">corporate_fare</span>
          <h2 className="font-jakarta font-semibold text-[18px] text-[#e5e1e4] tracking-tight">
            Active Organizers
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-[#d0bcff]/10 text-[#d0bcff] text-[11px] font-semibold border border-[#d0bcff]/20 font-inter">
            {organizers.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-[#958ea0]">
            <Loader2 className="h-7 w-7 animate-spin text-[#d0bcff]" />
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
          <div className="rounded-xl bg-[#1c1b1d] border border-[#494454]/30 flex flex-col items-center justify-center py-12 gap-3">
            <span className="material-symbols-outlined text-[40px] text-[#494454]">corporate_fare</span>
            <p className="text-[#958ea0] font-inter text-[13px]">No organizers yet</p>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#201f22] hover:bg-[#2a2a2c] text-[#d0bcff] text-[13px] font-medium font-inter border border-[#494454]/30 transition-colors"
              onClick={() => setCreateOpen(true)}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Create your first organizer
            </button>
          </div>
        )}
      </div>

      {/* ── Pending Applications Section ─────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#4cd7f6]">person_add</span>
          <h2 className="font-jakarta font-semibold text-[18px] text-[#e5e1e4] tracking-tight">
            Pending Applications
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-[#4cd7f6]/10 text-[#4cd7f6] text-[11px] font-semibold border border-[#4cd7f6]/20 font-inter">
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
