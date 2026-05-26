import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Tag } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AddCategoryDialog } from '@/components/events/add-category-dialog'
import { CategoryCardActions } from '@/components/events/category-card-actions'

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

  const { data: categories, error: categoriesError } = await supabase
    .from('race_categories')
    .select('*')
    .eq('event_id', id)
    .order('name', { ascending: true })

  if (categoriesError) {
    console.error('[categories] Supabase error:', categoriesError.message)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/organizer/events/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Race Categories</h1>
          <p className="text-muted-foreground">Manage categories for {event.name}</p>
        </div>
        <AddCategoryDialog eventId={id} />
      </div>

      {/* Category grid */}
      {categories && categories.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Card key={category.id} className="border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{category.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {category.gender || 'Open'} | Ages {category.min_age ?? 'Open'}–{category.max_age ?? 'Open'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    <Tag className="mr-1 h-3 w-3" />
                    {category.bib_prefix || '—'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-medium">RM {Number(category.price ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Slots</span>
                    <span className="font-medium">{category.max_slots ?? 'Unlimited'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BIB Start</span>
                    <span className="font-medium">{category.bib_start ?? 1}</span>
                  </div>
                </div>
                {/* Edit + Delete — client component handles dialogs & toasts */}
                <CategoryCardActions category={category} eventId={id} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Tag className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-1">No categories yet</p>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first race category to start accepting registrations.
            </p>
            <AddCategoryDialog eventId={id} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}