'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Shirt } from 'lucide-react'

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

type ShirtSize = (typeof SHIRT_SIZES)[number]

interface FormData {
  name: string
  description: string
  event_date: string
  location: string
  status: string
}

interface FormErrors {
  name?: string
  event_date?: string
}

function createEmptyInventory(): Record<ShirtSize, string> {
  return {
    XS: '0',
    S: '0',
    M: '0',
    L: '0',
    XL: '0',
    XXL: '0',
  }
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
  const [shirtInventory, setShirtInventory] = useState<Record<ShirtSize, string>>(
    createEmptyInventory
  )
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    event_date: '',
    location: '',
    status: 'draft'
  })

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Event name is required'
    }

    if (!formData.event_date) {
      newErrors.event_date = 'Event date is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      const organizerId = user.app_metadata?.organizer_id

      if (!organizerId) {
        router.push('/login')
        return
      }

      const { data: event, error } = await supabase
        .from('events')
        .insert({
        organizer_id: organizerId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        event_date: formData.event_date,
        location: formData.location.trim() || null,
        status: formData.status
        })
        .select('id')
        .single()

      if (error) throw error

      const inventoryRows = SHIRT_SIZES.map((size) => ({
        event_id: event.id,
        organizer_id: organizerId,
        size,
        initial_qty: parseInventoryQuantity(shirtInventory[size]),
        claimed_qty: 0,
      }))

      const { error: inventoryError } = await supabase
        .from('event_shirt_inventory')
        .upsert(inventoryRows, { onConflict: 'event_id,size' })

      if (inventoryError) throw inventoryError

      router.push(`/organizer/events/${event.id}/repc`)
    } catch (error) {
      console.error('Error creating event:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/organizer/events')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Event</h1>
          <p className="text-muted-foreground">Add a new running event</p>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
          <CardDescription>Fill in the details for your new event</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Event Name *</Label>
              <Input
                id="name"
                placeholder="e.g., KL Marathon 2024"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your event..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event_date">Event Date *</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={formData.event_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, event_date: e.target.value }))}
                />
                {errors.event_date && <p className="text-sm text-destructive">{errors.event_date}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., Kuala Lumpur, Malaysia"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Shirt className="h-4 w-4 text-muted-foreground" />
                <div>
                  <h2 className="text-sm font-medium">REPC Shirt Inventory</h2>
                  <p className="text-sm text-muted-foreground">Initial race kit stock by size</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {SHIRT_SIZES.map((size) => (
                  <div key={size} className="space-y-2">
                    <Label htmlFor={`shirt-${size}`}>{size}</Label>
                    <Input
                      id={`shirt-${size}`}
                      type="number"
                      min={0}
                      value={shirtInventory[size]}
                      onChange={(event) =>
                        setShirtInventory((current) => ({
                          ...current,
                          [size]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/organizer/events')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Event'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
