'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OrganizerCard } from '@/components/admin/organizer-card'
import { OrganizerFormDialog } from '@/components/admin/organizer-form'
import type { Organizer } from '@/components/admin/types'

const supabase = createClient()

export default function AdminOrganizersPage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
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
      if (data) setOrganizers(data)
      setLoading(false)
    }
    fetchOrganizers()
  }, [])

  const handleCreate = (organizer: Organizer) => {
    setOrganizers([organizer, ...organizers])
  }

  const handleUpdate = (organizer: Organizer) => {
    setOrganizers(organizers.map(o => (o.id === organizer.id ? organizer : o)))
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
      setOrganizers(organizers.filter(o => o.id !== selectedOrganizer.id))
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
      setOrganizers(organizers.map(o =>
        o.id === organizer.id ? { ...o, is_active: !o.is_active } : o
      ))
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizers</h1>
          <p className="text-muted-foreground">Manage event organizers on the platform</p>
        </div>
        <OrganizerFormDialog
          open={open}
          onOpenChange={setOpen}
          onSuccess={handleCreate}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Organizer
            </Button>
          }
        />
      </div>

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
              Are you sure you want to delete <strong>{selectedOrganizer?.name}</strong>? This will
              also delete all their events, registrations, and data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleConfirmDelete}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Organizer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-border">
              <CardHeader>
                <div className="h-6 w-24 animate-pulse rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {organizers.map(organizer => (
            <OrganizerCard
              key={organizer.id}
              organizer={organizer}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          ))}
        </div>
      )}

      {!loading && (!organizers || organizers.length === 0) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No organizers yet</p>
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first organizer
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}