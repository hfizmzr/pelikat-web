import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, CheckCircle, Clock, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { notFound } from 'next/navigation'
import { PhotoUploader } from '@/components/events/photo-uploader'
import Image from 'next/image'

export default async function OrganizerEventPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, name, organizer_id')
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
    auto: photos?.filter((p) => p.status === 'auto').length || 0,
    review: photos?.filter((p) => p.status === 'review').length || 0,
    confirmed: photos?.filter((p) => p.status === 'confirmed').length || 0,
  }

  // Generate signed URLs for photos that have a storage path
  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (photo) => {
      if (!photo.storage_path) return { ...photo, url: null }
      const { data } = await supabase.storage
        .from('race-photos')
        .createSignedUrl(photo.storage_path, 3600) // 1h expiry
      return { ...photo, url: data?.signedUrl ?? null }
    })
  )

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
          <h1 className="text-3xl font-bold tracking-tight">Photo Management</h1>
          <p className="text-muted-foreground">AI-powered photo tagging for {event.name}</p>
        </div>
        <Badge variant="outline" className="hidden sm:flex">AI Processing Enabled</Badge>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
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

      {/* Upload Section — client component */}
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Upload Photos</CardTitle>
              <CardDescription>
                Upload race photos. The AI pipeline will detect BIB numbers and tag runners automatically.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PhotoUploader eventId={event.id} organizerId={event.organizer_id} />
        </CardContent>
      </Card>

      {/* Gallery */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Photo Gallery</CardTitle>
          <CardDescription>AI-tagged photos from this event</CardDescription>
        </CardHeader>
        <CardContent>
          {photosWithUrls.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {photosWithUrls.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-secondary"
                >
                  {photo.url ? (
                    <Image
                      src={photo.url}
                      alt={`BIB ${photo.bib_number ?? 'unknown'}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 16vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white text-xs font-medium">
                      BIB: {photo.bib_number || 'N/A'}
                    </p>
                    <Badge
                      variant={
                        photo.status === 'confirmed'
                          ? 'default'
                          : photo.status === 'review'
                          ? 'secondary'
                          : 'outline'
                      }
                      className="text-xs mt-1"
                    >
                      {photo.status}
                    </Badge>
                  </div>
                  {photo.confidence != null && (
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
              <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No photos uploaded yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use the uploader above to add race photos.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}