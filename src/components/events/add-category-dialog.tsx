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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Loader2 } from 'lucide-react'
import { createCategory } from '@/components/events/actions'
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
      } catch (err: any) {
        setError(err.message || 'Failed to create category')
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
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="cat-name">Category Name *</Label>
            <Input
              id="cat-name"
              name="name"
              placeholder="e.g. Open 10KM"
              required
              disabled={isPending}
            />
          </div>

          {/* Gender + BIB Prefix row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Gender</Label>
              <Select value={gender} onValueChange={setGender} disabled={isPending}>
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
              <Label htmlFor="cat-bib-prefix">BIB Prefix</Label>
              <Input
                id="cat-bib-prefix"
                name="bib_prefix"
                placeholder="e.g. A"
                maxLength={5}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Age range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cat-min-age">Min Age</Label>
              <Input
                id="cat-min-age"
                name="min_age"
                type="number"
                min={0}
                max={120}
                placeholder="e.g. 18"
                disabled={isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-max-age">Max Age</Label>
              <Input
                id="cat-max-age"
                name="max_age"
                type="number"
                min={0}
                max={120}
                placeholder="e.g. 40"
                disabled={isPending}
              />
            </div>
          </div>

          {/* Price + Max slots + BIB Start */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cat-price">Price (RM)</Label>
              <Input
                id="cat-price"
                name="price"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                disabled={isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-max-slots">Max Slots</Label>
              <Input
                id="cat-max-slots"
                name="max_slots"
                type="number"
                min={1}
                placeholder="Unlimited"
                disabled={isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-bib-start">BIB Start</Label>
              <Input
                id="cat-bib-start"
                name="bib_start"
                type="number"
                min={1}
                defaultValue={1}
                disabled={isPending}
              />
            </div>
          </div>

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
