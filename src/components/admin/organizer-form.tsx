'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Organizer } from './types'

const supabase = createClient()

interface OrganizerFormDialogProps {
  organizer?: Organizer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (organizer: Organizer) => void
  trigger?: React.ReactNode
}

export function OrganizerFormDialog({ organizer, open, onOpenChange, onSuccess, trigger }: OrganizerFormDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [subExpiresAt, setSubExpiresAt] = useState('')

  const isEdit = !!organizer

  const resetForm = () => {
    setName(organizer?.name || '')
    setSlug(organizer?.slug || '')
    setContactEmail(organizer?.contact_email || '')
    setSubExpiresAt(organizer?.sub_expires_at ? organizer.sub_expires_at.split('T')[0] : '')
  }

   
  useEffect(() => {
    if (open) {
      resetForm()
    }
  }, [open])

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    if (isEdit) {
      const updates: Partial<Organizer> = { name, slug }
      if (subExpiresAt) {
        updates.sub_expires_at = new Date(subExpiresAt).toISOString()
      }
      if (contactEmail) {
        updates.contact_email = contactEmail
      }

      const { data, error } = await supabase
        .from('organizers')
        .update(updates)
        .eq('id', organizer.id)
        .select()
        .single()

      if (error) {
        alert(error.message)
      } else if (data) {
        onSuccess(data)
        onOpenChange(false)
      }
    } else {
      const { error } = await supabase
        .from('organizers')
        .insert({
          name,
          slug,
          contact_email: contactEmail || null,
          is_active: true,
        })
        .select()
        .single()

      if (error) {
        alert(error.message)
      } else {
        const { data: created } = await supabase
          .from('organizers')
          .select('*')
          .eq('slug', slug)
          .single()
        if (created) {
          onSuccess(created)
          onOpenChange(false)
        }
      }
    }
    setSubmitting(false)
  }

  return (
    <>
      {trigger && (
        <div onClick={() => onOpenChange(true)} style={{ cursor: 'pointer' }}>
          {trigger}
        </div>
      )}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Organizer' : 'Add New Organizer'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update organizer details. The organizer will still be able to access their dashboard if active.'
              : 'Create a new organizer account. They can then sign in to manage their events.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={isEdit ? 'edit-name' : 'name'}>Organizer Name</Label>
            <Input
              id={isEdit ? 'edit-name' : 'name'}
              placeholder="e.g., Jakarta Marathon"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => !isEdit && setSlug(generateSlug(e.target.value))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={isEdit ? 'edit-slug' : 'slug'}>URL Slug</Label>
            <Input
              id={isEdit ? 'edit-slug' : 'slug'}
              placeholder="jakarta-marathon"
              value={slug}
              onChange={(e) => setSlug(generateSlug(e.target.value))}
              required
            />
            <p className="text-xs text-muted-foreground">This will be used as: pelikat.com/o/{slug}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={isEdit ? 'edit-contactEmail' : 'contactEmail'}>Contact Email</Label>
            <Input
              id={isEdit ? 'edit-contactEmail' : 'contactEmail'}
              type="email"
              placeholder="organizer@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Used for login and notifications</p>
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="edit-expires">Subscription Expires</Label>
              <Input
                id="edit-expires"
                type="date"
                value={subExpiresAt}
                onChange={(e) => setSubExpiresAt(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Organizer'}
            </Button>
          </div>
        </form>
      </DialogContent>
      </Dialog>
    </>
  )
}