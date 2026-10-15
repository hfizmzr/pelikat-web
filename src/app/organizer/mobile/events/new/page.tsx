'use client'

import { ArrowLeft, Footprints, LoaderCircle, Shirt } from "lucide-react"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/audit'

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

type ShirtSize = (typeof SHIRT_SIZES)[number]

interface FormData {
  name: string
  description: string
  event_date: string
  event_type: 'physical' | 'virtual'
  location: string
  status: string
  reg_open: string
  reg_close: string
}

interface FormErrors {
  name?: string
  event_date?: string
}

function createEmptyInventory(): Record<ShirtSize, string> {
  return { XS: '0', S: '0', M: '0', L: '0', XL: '0', XXL: '0' }
}

function parseInventoryQuantity(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

export default function NewEventPage() {
  const router = useRouter()
  const supabase = createClient()
  
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [shirtInventory, setShirtInventory] = useState<Record<ShirtSize, string>>(createEmptyInventory)
  const [formData, setFormData] = useState<FormData>({
    name: '', description: '', event_date: '', event_type: 'physical', location: '',
    status: 'draft', reg_open: '', reg_close: '',
  })

  const validate = (): boolean => {
    const newErrors: FormErrors = {}
    if (!formData.name.trim()) newErrors.name = 'Event name is required'
    if (!formData.event_date) newErrors.event_date = 'Event date is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push('/login')
      const organizerId = user.app_metadata?.organizer_id
      if (!organizerId) return router.push('/login')

      const { data: event, error } = await supabase
        .from('events')
        .insert({
          organizer_id: organizerId,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          event_date: formData.event_date,
          event_type: formData.event_type,
          location: formData.event_type === 'virtual' ? null : (formData.location.trim() || null),
          status: formData.status,
          reg_open: formData.reg_open || null,
          reg_close: formData.reg_close || null,
        })
        .select('id')
        .single()
      if (error) throw error

      if (formData.event_type === 'physical') {
        const inventoryRows = SHIRT_SIZES.map((size) => ({
          event_id: event.id,
          organizer_id: organizerId,
          size,
          initial_qty: parseInventoryQuantity(shirtInventory[size]),
          claimed_qty: 0,
        }))
        const { error: inventoryError } = await supabase.from('event_shirt_inventory').upsert(inventoryRows, { onConflict: 'event_id,size' })
        if (inventoryError) throw inventoryError
      }

      await logAudit(supabase, 'organizer_create_event', event.id, { name: formData.name, event_date: formData.event_date, event_type: formData.event_type })
      router.push(`/organizer/mobile/events`)
    } catch (error) {
      console.error('Error creating event:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      {/* Background ambient bloom */}
      <div className="absolute top-1/3 -right-20 w-[30rem] h-[30rem] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6 w-full">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/organizer/mobile/events')}
            className="w-10 h-10 rounded-xl bg-card border border-muted flex items-center justify-center text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-[20px]" />
          </button>
          <div>
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase w-fit mb-1 block">New Campaign</span>
            <h1 className="text-[28px] leading-[36px] font-bold text-foreground tracking-tight">Create Event</h1>
          </div>
        </div>

        {/* Full-width container replacing the narrow card */}
        <div className="bg-card rounded-2xl border border-muted p-6 md:p-8 w-full shadow-lg">
          <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full">
            
            {/* 2-Column Grid for main fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              <div className="flex flex-col gap-2 col-span-1 md:col-span-2">
                <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Event Name *</label>
                <input
                  type="text"
                  placeholder="e.g., KL Marathon 2024"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground placeholder:text-border focus:outline-none focus:border-primary/50 transition-colors"
                />
                {errors.name && <p className="text-[12px] text-red-500 dark:text-red-300 mt-1">{errors.name}</p>}
              </div>

              <div className="flex flex-col gap-2 col-span-1 md:col-span-2">
                <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Description</label>
                <textarea
                  placeholder="Describe your event..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground placeholder:text-border focus:outline-none focus:border-primary/50 transition-colors resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Event Date *</label>
                <input
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, event_date: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
                />
                {errors.event_date && <p className="text-[12px] text-red-500 dark:text-red-300 mt-1">{errors.event_date}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Event Type *</label>
                <select
                  value={formData.event_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, event_type: e.target.value as FormData['event_type'] }))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-primary/50 transition-colors appearance-none"
                >
                  <option value="physical">Physical Event</option>
                  <option value="virtual">Virtual Run</option>
                </select>
              </div>

              {formData.event_type === 'physical' && (
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Location</label>
                  <input
                    type="text"
                    placeholder="e.g., Kuala Lumpur, Malaysia"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground placeholder:text-border focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Registration Opens</label>
                <input
                  type="datetime-local"
                  value={formData.reg_open}
                  onChange={(e) => setFormData(prev => ({ ...prev, reg_open: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Registration Closes</label>
                <input
                  type="datetime-local"
                  value={formData.reg_close}
                  onChange={(e) => setFormData(prev => ({ ...prev, reg_close: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-semibold tracking-wide uppercase text-muted-foreground">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-primary/50 transition-colors appearance-none"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            {/* Inventory Section (physical events only) */}
            {formData.event_type === 'physical' && (
              <div className="bg-card rounded-xl border border-muted p-5 w-full">
                <div className="flex items-center gap-3 mb-5">
                  <Shirt className="size-[20px] text-primary" />
                  <div>
                    <h2 className="text-[14px] font-bold text-foreground">REPC Shirt Inventory</h2>
                    <p className="text-[12px] text-muted-foreground">Initial race kit stock by size</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  {SHIRT_SIZES.map((size) => (
                    <div key={size} className="flex flex-col gap-2">
                      <label className="text-[12px] font-semibold tracking-wide text-muted-foreground text-center">{size}</label>
                      <input
                        type="number"
                        min={0}
                        value={shirtInventory[size]}
                        onChange={(e) => setShirtInventory(curr => ({ ...curr, [size]: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[14px] text-center text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formData.event_type === 'virtual' && (
              <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-5 text-[12px] text-muted-foreground">
                <Footprints className="size-[18px] shrink-0 text-primary" />
                <p>
                  Virtual Run: no venue, race-kit collection or physical bibs.
                  Participants submit their runs and sync to a live leaderboard.
                  Next: add distance categories for the run.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push('/organizer/mobile/events')}
                className="px-5 py-2.5 rounded-lg text-[14px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-lg text-[14px] font-semibold bg-primary text-primary-foreground hover:bg-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="size-[18px] animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Event'
                )}
              </button>
            </div>
            
          </form>
        </div>
      </div>
    </div>
  )
}
