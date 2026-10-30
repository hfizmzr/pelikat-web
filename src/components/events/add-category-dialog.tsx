'use client'

import { useState, useTransition, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Loader2 } from 'lucide-react'
import { createCategory } from '@/components/events/actions'
import { CategoryFormFields } from '@/components/events/category-form-fields'
import { toast } from 'sonner'

interface AddCategoryDialogProps {
  eventId: string
}

export function AddCategoryDialog({ eventId }: AddCategoryDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [gender, setGender] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (gender) formData.set('gender', gender)

    setError(null)
    startTransition(async () => {
      try {
        await createCategory(eventId, formData)
        setOpen(false)
        setGender('')
        formRef.current?.reset()
        toast.success('Category created successfully')
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : null) || 'Failed to create category')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Race Category</DialogTitle>
          <DialogDescription>
            Create a new race category for this event. Fields marked * are required.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 mt-2">
          <CategoryFormFields
            idPrefix="cat"
            gender={gender}
            onGenderChange={setGender}
            disabled={isPending}
          />

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
