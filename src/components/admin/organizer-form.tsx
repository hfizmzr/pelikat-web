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
import { Input } from '@/components/ui/input'
import type { Organizer } from './types'

const supabase = createClient()

interface OrganizerFormDialogProps {
  organizer?: Organizer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (organizer: Organizer) => void
  trigger?: React.ReactNode
}

function generateSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
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
    // Purposely re-runs only on dialog open; resetForm is stable at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    // Normalize once on submit — regenerating on every keystroke fights
    // manual slug entry (dashes get eaten mid-typing).
    const finalSlug = generateSlug(slug)

    if (isEdit) {
      const updates: Partial<Organizer> = { name, slug: finalSlug }
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
          slug: finalSlug,
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
          .eq('slug', finalSlug)
          .single()
        if (created) {
          // Fire-and-forget welcome email (UC01 step 5). The edge
          // function is a no-op stub when RESEND_API_KEY is absent.
          if (contactEmail) {
            void supabase.functions
              .invoke('send-transactional-email', {
                body: {
                  type: 'organizer_welcome',
                  organizerName: created.name,
                  organizerEmail: contactEmail,
                  loginUrl: `${window.location.origin}/login`,
                },
              })
              .then((res) => {
                if (res.error || !res.data?.success) {
                  console.error('send-transactional-email failed:', res.error || res.data)
                }
              })
              .catch((err) => {
                console.error('send-transactional-email error:', err)
              })
          }
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
        <DialogContent className="bg-[#201f22] border border-[#494454]/40 text-[#e5e1e4] rounded-xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-[18px] text-[#e5e1e4] flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#d0bcff]">
              {isEdit ? 'edit' : 'add_business'}
            </span>
            {isEdit ? 'Edit Organizer' : 'Add New Organizer'}
          </DialogTitle>
          <DialogDescription className="text-[#cbc3d7] font-inter text-[13px]">
            {isEdit
              ? 'Update organizer details. The organizer will still be able to access their dashboard if active.'
              : 'Create a new organizer account. They can then sign in to manage their events.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#cbc3d7] font-inter" htmlFor={isEdit ? 'edit-name' : 'name'}>Organizer Name</label>
            <Input
              id={isEdit ? 'edit-name' : 'name'}
              placeholder="e.g., Jakarta Marathon"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => !isEdit && !slug && setSlug(generateSlug(e.target.value))}
              required
              className="bg-[#131315] border-[#494454]/40 text-[#e5e1e4] placeholder:text-[#494454] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#cbc3d7] font-inter" htmlFor={isEdit ? 'edit-slug' : 'slug'}>URL Slug</label>
            <Input
              id={isEdit ? 'edit-slug' : 'slug'}
              placeholder="jakarta-marathon"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="bg-[#131315] border-[#494454]/40 text-[#e5e1e4] placeholder:text-[#494454] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
            />
            <p className="text-[11px] text-[#958ea0] font-inter">Used as: pelikat.com/o/{slug}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-[#cbc3d7] font-inter" htmlFor={isEdit ? 'edit-contactEmail' : 'contactEmail'}>Contact Email</label>
            <Input
              id={isEdit ? 'edit-contactEmail' : 'contactEmail'}
              type="email"
              placeholder="organizer@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="bg-[#131315] border-[#494454]/40 text-[#e5e1e4] placeholder:text-[#494454] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
            />
            <p className="text-[11px] text-[#958ea0] font-inter">Used for login and notifications</p>
          </div>
          {isEdit && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-[#cbc3d7] font-inter" htmlFor="edit-expires">Subscription Expires</label>
              <Input
                id="edit-expires"
                type="date"
                value={subExpiresAt}
                onChange={(e) => setSubExpiresAt(e.target.value)}
                className="bg-[#131315] border-[#494454]/40 text-[#e5e1e4] focus:ring-1 focus:ring-[#d0bcff] focus:border-[#d0bcff] rounded-lg text-[13px]"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-[#2a2a2c] hover:bg-[#353437] text-[#e5e1e4] text-[13px] font-medium font-inter transition-colors border border-[#494454]/30"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#d0bcff] hover:bg-[#6d3bd7] text-[#3c0091] hover:text-white text-[13px] font-semibold transition-all glow-primary font-inter disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Organizer'}
            </button>
          </div>
        </form>
      </DialogContent>
      </Dialog>
    </>
  )
}