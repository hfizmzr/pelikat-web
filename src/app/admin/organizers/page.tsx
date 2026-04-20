import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, MoreHorizontal } from 'lucide-react'

export default async function AdminOrganizersPage() {
  const supabase = await createClient()

  const { data: organizers } = await supabase
    .from('organizers')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizers</h1>
          <p className="text-muted-foreground">Manage event organizers on the platform</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Organizer
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {organizers?.map((organizer) => (
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

      {(!organizers || organizers.length === 0) && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No organizers yet</p>
            <Button variant="outline" className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create your first organizer
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}