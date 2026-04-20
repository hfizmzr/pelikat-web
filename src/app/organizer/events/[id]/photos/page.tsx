import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Image, Upload, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function OrganizerEventPhotosPage({
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

  const { data: photos } = await supabase
    .from('photo_tags')
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  const stats = {
    total: photos?.length || 0,
    auto: photos?.filter(p => p.status === 'auto').length || 0,
    review: photos?.filter(p => p.status === 'review').length || 0,
    confirmed: photos?.filter(p => p.status === 'confirmed').length || 0,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Photo Management</h1>
        <p className="text-muted-foreground">Manage AI-processed photos for {event.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Image className="h-5 w-5" />
              {stats.total}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Auto-Tagged</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              {stats.auto}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Need Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              {stats.review}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-500" />
              {stats.confirmed}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Upload Photos</CardTitle>
              <CardDescription>Upload race photos for AI processing</CardDescription>
            </div>
            <Badge variant="outline">AI Processing Enabled</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              Drag and drop photos here, or click to browse
            </p>
            <p className="text-sm text-muted-foreground">
              Supports JPG, PNG up to 10MB each
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Photo Gallery</CardTitle>
          <CardDescription>AI-tagged photos from this event</CardDescription>
        </CardHeader>
        <CardContent>
          {photos && photos.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {photos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-secondary">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Image className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white text-xs font-medium">BIB: {photo.bib_number || 'N/A'}</p>
                    <Badge
                      variant={photo.status === 'confirmed' ? 'default' : photo.status === 'review' ? 'secondary' : 'outline'}
                      className="text-xs mt-1"
                    >
                      {photo.status}
                    </Badge>
                  </div>
                  {photo.confidence && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className="bg-background/80 text-xs">
                        {(photo.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Image className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No photos uploaded yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}