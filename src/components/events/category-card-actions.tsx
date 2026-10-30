'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { updateCategory, deleteCategory } from '@/components/events/actions'
import { CategoryFormFields } from '@/components/events/category-form-fields'

interface Category {
  id: string
  name: string
  gender: string | null
  min_age: number | null
  max_age: number | null
  bib_prefix: string | null
  bib_start: number | null
  max_slots: number | null
  price: number | null
}

interface CategoryCardActionsProps {
  category: Category
  eventId: string
}

export function CategoryCardActions({ category, eventId }: CategoryCardActionsProps) {
  // ── Edit state ───────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false)
  const [isUpdating, startUpdate] = useTransition()
  const [gender, setGender] = useState<string>(category.gender ?? '')
  const [editError, setEditError] = useState<string | null>(null)

  // ── Delete state ─────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, startDelete] = useTransition()

  // ── Handlers ──────────────────────────────────────────────────────
  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (gender) formData.set('gender', gender)

    setEditError(null)
    startUpdate(async () => {
      try {
        await updateCategory(category.id, eventId, formData)
        setEditOpen(false)
        toast.success('Category updated successfully')
      } catch (err: unknown) {
        setEditError((err instanceof Error ? err.message : null) || 'Failed to update category')
      }
    })
  }

  const handleDelete = () => {
    startDelete(async () => {
      try {
        await deleteCategory(category.id, eventId)
        setDeleteOpen(false)
        toast.success(`"${category.name}" deleted`)
      } catch (err: unknown) {
        setDeleteOpen(false)
        toast.error((err instanceof Error ? err.message : null) || 'Failed to delete category')
      }
    })
  }

  return (
    <>
      {/* ── Action Buttons ────────────────────────────────────── */}
      <div className="flex gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => {
            setGender(category.gender ?? '')
            setEditError(null)
            setEditOpen(true)
          }}
        >
          <Pencil className="mr-1 h-3 w-3" />
          Edit
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* ── Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>Update the details for this race category.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4 mt-2">
            <CategoryFormFields
              idPrefix={`edit-${category.id}`}
              values={category}
              gender={gender}
              onGenderChange={setGender}
              disabled={isUpdating}
            />

            {editError && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                {editError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{category.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this race category. Runners already registered under
              this category will lose their category assignment. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive !text-white hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
