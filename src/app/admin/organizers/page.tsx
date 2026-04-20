'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, MoreHorizontal, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AdminOrganizersPage() {
  const supabase = createClient()
  const [organizers, setOrganizers] = useState<{ id: string; name: string; slug: string; is_active: boolean; created_at: string; sub_expires_at: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    const { data: existing } = await supabase
      .from('organizers')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) {
      alert('An organizer with this slug already exists')
      setSubmitting(false)
      return
    }

    const { data, error } = await supabase
      .from('organizers')
      .insert({
        name,
        slug,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      alert(error.message)
    } else if (data) {
      setOrganizers([data, ...organizers])
      setOpen(false)
      setName('')
      setSlug('')
    }
    setSubmitting(false)
  }

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizers</h1>
          <p className="text-muted-foreground">Manage event organizers on the platform</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Organizer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Organizer</DialogTitle>
              <DialogDescription>
                Create a new organizer account. They can then sign in to manage their events.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organizer Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Jakarta Marathon"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={(e) => setSlug(generateSlug(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  placeholder="jakarta-marathon"
                  value={slug}
                  onChange={(e) => setSlug(generateSlug(e.target.value))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This will be used as: pelikat.com/o/{slug}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Organizer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
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
          {organizers.map((organizer) => (
            <Card key={organizer.id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{organizer.name}</CardTitle>
                    <CardDescription className="mt-1">@{organizer.slug}</CardDescription>
                  </div>
                  <Badge variant={organizer.is_active ? 'default' : 'secondary'}>
                    {organizer.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{new Date(organizer.created_at).toLocaleDateString()}</span>
                  </div>
                  {organizer.sub_expires_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expires</span>
                      <span>{new Date(organizer.sub_expires_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    View Details
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
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