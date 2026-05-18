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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { updateCategory, deleteCategory } from '@/components/events/actions'

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
      } catch (err: any) {
        setEditError(err.message || 'Failed to update category')
      }
    })
  }

  const handleDelete = () => {
    startDelete(async () => {
      try {
        await deleteCategory(category.id, eventId)
        setDeleteOpen(false)
        toast.success(`"${category.name}" deleted`)
      } catch (err: any) {
        setDeleteOpen(false)
        toast.error(err.message || 'Failed to delete category')
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
            {/* Name */}
            <div className="grid gap-1.5">
              <Label htmlFor={`edit-name-${category.id}`}>Category Name *</Label>
              <Input
                id={`edit-name-${category.id}`}
                name="name"
                defaultValue={category.name}
                required
                disabled={isUpdating}
              />
            </div>

            {/* Gender + BIB Prefix */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender} disabled={isUpdating}>
                  <SelectTrigger>
                    <SelectValue placeholder="Open" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mixed">Mixed / Open</SelectItem>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`edit-bib-prefix-${category.id}`}>BIB Prefix</Label>
                <Input
                  id={`edit-bib-prefix-${category.id}`}
                  name="bib_prefix"
                  defaultValue={category.bib_prefix ?? ''}
                  maxLength={5}
                  disabled={isUpdating}
                />
              </div>
            </div>

            {/* Age range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`edit-min-age-${category.id}`}>Min Age</Label>
                <Input
                  id={`edit-min-age-${category.id}`}
                  name="min_age"
                  type="number"
                  min={0}
                  max={120}
                  defaultValue={category.min_age ?? ''}
                  disabled={isUpdating}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`edit-max-age-${category.id}`}>Max Age</Label>
                <Input
                  id={`edit-max-age-${category.id}`}
                  name="max_age"
                  type="number"
                  min={0}
                  max={120}
                  defaultValue={category.max_age ?? ''}
                  disabled={isUpdating}
                />
              </div>
            </div>

            {/* Price + Max Slots + BIB Start */}
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`edit-price-${category.id}`}>Price (RM)</Label>
                <Input
                  id={`edit-price-${category.id}`}
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={category.price ?? 0}
                  disabled={isUpdating}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`edit-max-slots-${category.id}`}>Max Slots</Label>
                <Input
                  id={`edit-max-slots-${category.id}`}
                  name="max_slots"
                  type="number"
                  min={1}
                  defaultValue={category.max_slots ?? ''}
                  placeholder="Unlimited"
                  disabled={isUpdating}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`edit-bib-start-${category.id}`}>BIB Start</Label>
                <Input
                  id={`edit-bib-start-${category.id}`}
                  name="bib_start"
                  type="number"
                  min={1}
                  defaultValue={category.bib_start ?? 1}
                  disabled={isUpdating}
                />
              </div>
            </div>

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
