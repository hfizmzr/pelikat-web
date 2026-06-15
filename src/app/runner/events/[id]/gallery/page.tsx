import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Image as ImageIcon } from 'lucide-react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { RunnerPhotoActions } from '@/components/events/runner-photo-actions'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Photos - Pelikat',
  description: 'Race photos from your events',
}

export default async function RunnerGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase
      .from('runner_profiles')
      .select('id')
      .eq('user_id', user?.id)
      .single(),
    supabase
      .from('events')
      .select('id, name')
      .eq('id', id)
      .single(),
  ])

  if (!event) {
    notFound()
  }

  const { data: registration } = await supabase
    .from('registrations')
    .select('bib_number')
    .eq('event_id', id)
    .eq('runner_id', profile?.id)
    .single()

  if (!registration) {
    notFound()
  }

  const { data: photos } = await supabase
    .from('photo_tags')
    .select('*')
    .eq('event_id', id)
    .eq('runner_id', profile?.id)
    .in('status', ['auto', 'confirmed'])
    .order('created_at', { ascending: false })

  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (photo) => {
      if (!photo.storage_path) return { ...photo, url: null }

      const { data, error } = await supabase.storage
        .from('race-photos')
        .createSignedUrl(photo.storage_path, 3600)

      return {
        ...photo,
        fileName: photo.storage_path.split('/').pop() ?? 'Race photo',
        url: data?.signedUrl ?? null,
        urlError: error?.message ?? null,
      }
    })
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Photos</h1>
        <p className="text-muted-foreground">Photos from {event.name}</p>
      </div>

      {photosWithUrls.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">
              {photosWithUrls.length} photos found
            </p>
            <div className="flex gap-2">
              <Badge variant="outline">BIB: {registration.bib_number}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photosWithUrls.map((photo) => (
              <Card key={photo.id} className="border-border overflow-hidden">
                <div className="aspect-square relative bg-secondary">
                  {photo.url ? (
                    <Image
                      src={photo.url}
                      alt={`Race photo for BIB ${photo.bib_number ?? registration.bib_number}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2 z-10">
                      <RunnerPhotoActions
                        imageUrl={photo.url}
                        fileName={photo.fileName}
                        eventId={id}
                        photoTagId={photo.id}
                      />
                  </div>
                  {photo.confidence && (
                    <div className="absolute left-2 top-2">
                      <Badge variant="secondary" className="bg-background/80">
                        {(photo.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  )}
                  {!photo.url && photo.urlError && (
                    <div className="absolute bottom-2 left-2 right-2 rounded-md bg-background/90 p-2 text-xs text-destructive">
                      {photo.urlError}
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <p className="truncate text-xs text-muted-foreground" title={photo.storage_path}>
                    {photo.fileName}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">No photos yet</p>
            <p className="text-sm text-muted-foreground">
              Photos will appear here after the event photo processing is complete
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
