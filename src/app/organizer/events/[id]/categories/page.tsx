import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function OrganizerEventCategoriesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const { data: categories } = await supabase
    .from('race_categories')
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Race Categories</h1>
          <p className="text-muted-foreground">Manage categories for {event.name}</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories?.map((category) => (
          <Card key={category.id} className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{category.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {category.gender || 'Open'} | Ages {category.min_age || 'Open'}-{category.max_age || 'Open'}
                  </CardDescription>
                </div>
                <Badge variant="outline">{category.bib_prefix || '-'}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-medium">${category.price || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Slots</span>
                  <span className="font-medium">{category.max_slots || 'Unlimited'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">BIB Start</span>
                  <span className="font-medium">{category.bib_start || 1}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1">
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Button>
                <Button variant="ghost" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(!categories || categories.length === 0) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No categories yet</p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add your first category
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}