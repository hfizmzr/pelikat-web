'use client'

import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2 } from 'lucide-react'
import type { Organizer } from './types'

const supabase = createClient()

interface OrganizerCardProps {
  organizer: Organizer
  onEdit: (organizer: Organizer) => void
  onDelete: (organizer: Organizer) => void
  onToggleActive: (organizer: Organizer) => void
}

export function OrganizerCard({ organizer, onEdit, onDelete, onToggleActive }: OrganizerCardProps) {
  return (
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
        {organizer.contact_email && (
          <div className="mb-2 text-sm">
            <span className="text-muted-foreground">Email: </span>
            <span className="text-primary">{organizer.contact_email}</span>
          </div>
        )}
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
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onEdit(organizer)}
          >
            <Pencil className="mr-2 h-3 w-3" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(organizer)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant={organizer.is_active ? 'secondary' : 'default'}
          size="sm"
          className="mt-2 w-full"
          onClick={() => onToggleActive(organizer)}
        >
          {organizer.is_active ? 'Deactivate' : 'Activate'}
        </Button>
      </CardContent>
    </Card>
  )
}