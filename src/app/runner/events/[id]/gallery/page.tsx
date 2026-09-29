import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
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
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href={`/runner/events/${id}`} className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-[#e5e1e4] leading-tight">
              My Photos
            </h1>
            <p className="text-[11px] text-[#958ea0] truncate max-w-full">
              {event.name}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-4">
        {photosWithUrls.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#4edea3]">photo_library</span>
                <span className="text-[14px] font-bold text-[#e5e1e4]">{photosWithUrls.length} photos</span>
              </div>
              <span className="px-2 py-0.5 bg-[#4edea3]/10 text-[#4edea3] text-[10px] font-bold uppercase tracking-wider rounded border border-[#4edea3]/20">
                BIB {registration.bib_number}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {photosWithUrls.map((photo) => (
                <div key={photo.id} className="relative flex flex-col bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden active:scale-[0.98] transition-transform">
                  <div className="aspect-[4/5] relative bg-[#23232b] w-full">
                    {photo.url ? (
                      <Image
                        src={photo.url}
                        alt={`Race photo for BIB ${photo.bib_number ?? registration.bib_number}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[32px] text-[#353437]">broken_image</span>
                      </div>
                    )}
                    
                    {/* Action buttons wrapper overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
                    
                    <div className="absolute right-2 bottom-2 z-10 pointer-events-auto flex items-center gap-1">
                      <RunnerPhotoActions
                        imageUrl={photo.url}
                        fileName={photo.fileName}
                        eventId={id}
                        photoTagId={photo.id}
                      />
                    </div>

                    {photo.confidence && (
                      <div className="absolute left-2 top-2 z-10">
                        <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[#4edea3] text-[9px] font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[10px]">robot_2</span>
                          {(photo.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                    {!photo.url && photo.urlError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-3 text-center">
                        <span className="text-[10px] text-[#ffb4ab]">{photo.urlError}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-[#1c1b1d] border border-[#353437]/40">
            <div className="w-16 h-16 bg-[#201f22] rounded-full flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px] text-[#958ea0]">add_a_photo</span>
            </div>
            <p className="text-[16px] font-bold text-[#e5e1e4] mb-2">No photos found yet</p>
            <p className="text-[13px] text-[#958ea0]">
              Our AI is still processing the event photos. Once we find you, they will appear here!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
