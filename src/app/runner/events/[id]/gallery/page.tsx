import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Image, Download, Share2 } from 'lucide-react'
import { notFound } from 'next/navigation'

export default async function RunnerGalleryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const { data: event } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', id)
    .single()

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
    .eq('bib_number', registration.bib_number)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Photos</h1>
        <p className="text-muted-foreground">Photos from {event.name}</p>
      </div>

      {photos && photos.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground">{photos.length} photos found</p>
            <div className="flex gap-2">
              <Badge variant="outline">BIB: {registration.bib_number}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <Card key={photo.id} className="border-border overflow-hidden">
                <div className="aspect-square relative bg-secondary">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Image className="h-12 w-12 text-muted-foreground" />
                  </div>
                  {photo.confidence && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-background/80">
                        {(photo.confidence * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="flex-1">
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1">
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Image className="h-12 w-12 text-muted-foreground mb-4" />
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

function Button({ children, variant, size, className, onClick }: any) {
  return (
    <button
      className={`${variant === 'ghost' ? 'hover:bg-secondary' : variant === 'outline' ? 'border border-input bg-background hover:bg-secondary' : 'bg-primary text-primary-foreground hover:bg-primary/90'} ${size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 py-2'} rounded-md inline-flex items-center justify-center gap-2 ${className || ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}