import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageIcon, CheckCircle, Clock, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { notFound } from 'next/navigation'
import { PhotoUploader } from '@/components/events/photo-uploader'
import { PhotoBatchFilter } from '@/components/events/photo-batch-filter'
import { PhotoReviewActions } from '@/components/events/photo-review-actions'
import { PhotoGalleryTagActions } from '@/components/events/photo-gallery-tag-actions'
import { PhotoRestoreActions } from '@/components/events/photo-restore-actions'
import { PhotoPreviewDialog } from '@/components/events/photo-preview-dialog'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Photo Management - Pelikat',
  description: 'AI-powered photo tagging for your event',
}

const REVIEW_PAGE_SIZE = 24
const GALLERY_PAGE_SIZE = 48
const REJECTED_PAGE_SIZE = 24

type PhotoTab = 'review' | 'gallery' | 'rejected'

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const page = Number.parseInt(rawValue ?? '1', 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

function clampPage(page: number, total: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return Math.min(page, totalPages)
}

function getPageRange(page: number, total: number, pageSize: number) {
  if (total === 0) return '0 of 0'

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return `${start}-${end} of ${total}`
}

function getPhotoPageHref(
  eventId: string,
  tab: PhotoTab,
  reviewPage: number,
  galleryPage: number,
  rejectedPage: number,
  batchId: string | null
) {
  const params = new URLSearchParams({ tab })

  if (batchId) params.set('batchId', batchId)
  if (reviewPage > 1) params.set('reviewPage', String(reviewPage))
  if (galleryPage > 1) params.set('galleryPage', String(galleryPage))
  if (rejectedPage > 1) params.set('rejectedPage', String(rejectedPage))

  return `/organizer/events/${eventId}/photos?${params.toString()}`
}

function PhotoPaginationControls({
  eventId,
  tab,
  currentPage,
  reviewPage,
  galleryPage,
  rejectedPage,
  total,
  pageSize,
  batchId,
}: {
  eventId: string
  tab: PhotoTab
  currentPage: number
  reviewPage: number
  galleryPage: number
  rejectedPage: number
  total: number
  pageSize: number
  batchId: string | null
}) {
  const hasPrevious = currentPage > 1
  const hasNext = currentPage * pageSize < total
  const previousPage = currentPage - 1
  const nextPage = currentPage + 1
  const previousHref = getPhotoPageHref(
    eventId,
    tab,
    tab === 'review' ? previousPage : reviewPage,
    tab === 'gallery' ? previousPage : galleryPage,
    tab === 'rejected' ? previousPage : rejectedPage,
    batchId
  )
  const nextHref = getPhotoPageHref(
    eventId,
    tab,
    tab === 'review' ? nextPage : reviewPage,
    tab === 'gallery' ? nextPage : galleryPage,
    tab === 'rejected' ? nextPage : rejectedPage,
    batchId
  )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <p className="text-sm text-muted-foreground">
        Showing {getPageRange(currentPage, total, pageSize)}
      </p>
      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Button asChild variant="outline" size="sm">
            <Link href={previousHref}>Previous</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}
        <Badge variant="outline">Page {currentPage}</Badge>
        {hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link href={nextHref}>Next</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}

export default async function OrganizerEventPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    tab?: string
    batchId?: string
    reviewPage?: string
    galleryPage?: string
    rejectedPage?: string
  }>
}) {
  const [{ id }, query, supabase] = await Promise.all([
    params,
    searchParams,
    createClient(),
  ])

  const { data: event } = await supabase
    .from('events')
    .select('id, name, organizer_id')
    .eq('id', id)
    .single()

  if (!event) {
    notFound()
  }

  const requestedReviewPage = parsePage(query.reviewPage)
  const requestedGalleryPage = parsePage(query.galleryPage)
  const requestedRejectedPage = parsePage(query.rejectedPage)
  const selectedBatchId = query.batchId && query.batchId !== 'all' ? query.batchId : null

  const { data: batchRows } = await supabase
    .from('photo_tags')
    .select('batch_id, created_at')
    .eq('event_id', id)
    .not('batch_id', 'is', null)
    .order('created_at', { ascending: false })

  const batchMap = new Map<string, { id: string; count: number; createdAt: string | null }>()

  for (const row of batchRows ?? []) {
    if (!row.batch_id) continue

    const current = batchMap.get(row.batch_id)

    if (current) {
      current.count += 1
    } else {
      batchMap.set(row.batch_id, {
        id: row.batch_id,
        count: 1,
        createdAt: row.created_at ?? null,
      })
    }
  }

  const batchOptions = Array.from(batchMap.values()).map((batch, index) => ({
    id: batch.id,
    count: batch.count,
    label: `Batch ${index + 1} - ${batch.id.slice(0, 8)}`,
  }))

  let totalCountQuery = supabase
    .from('photo_tags')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
  let autoCountQuery = supabase
    .from('photo_tags')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('status', 'auto')
  let reviewCountQuery = supabase
    .from('photo_tags')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('status', 'review')
  let confirmedCountQuery = supabase
    .from('photo_tags')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('status', 'confirmed')
  let galleryCountQuery = supabase
    .from('photo_tags')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .in('status', ['auto', 'confirmed'])
  let rejectedCountQuery = supabase
    .from('photo_tags')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('status', 'discarded')

  if (selectedBatchId) {
    totalCountQuery = totalCountQuery.eq('batch_id', selectedBatchId)
    autoCountQuery = autoCountQuery.eq('batch_id', selectedBatchId)
    reviewCountQuery = reviewCountQuery.eq('batch_id', selectedBatchId)
    confirmedCountQuery = confirmedCountQuery.eq('batch_id', selectedBatchId)
    galleryCountQuery = galleryCountQuery.eq('batch_id', selectedBatchId)
    rejectedCountQuery = rejectedCountQuery.eq('batch_id', selectedBatchId)
  }

  const [
    totalCountResult,
    autoCountResult,
    reviewCountResult,
    confirmedCountResult,
    galleryCountResult,
    rejectedCountResult,
  ] = await Promise.all([
    totalCountQuery,
    autoCountQuery,
    reviewCountQuery,
    confirmedCountQuery,
    galleryCountQuery,
    rejectedCountQuery,
  ])

  const stats = {
    total: totalCountResult.count ?? 0,
    auto: autoCountResult.count ?? 0,
    review: reviewCountResult.count ?? 0,
    confirmed: confirmedCountResult.count ?? 0,
  }
  const galleryCount = galleryCountResult.count ?? 0
  const rejectedCount = rejectedCountResult.count ?? 0
  const reviewPage = clampPage(requestedReviewPage, stats.review, REVIEW_PAGE_SIZE)
  const galleryPage = clampPage(requestedGalleryPage, galleryCount, GALLERY_PAGE_SIZE)
  const rejectedPage = clampPage(requestedRejectedPage, rejectedCount, REJECTED_PAGE_SIZE)
  const reviewFrom = (reviewPage - 1) * REVIEW_PAGE_SIZE
  const galleryFrom = (galleryPage - 1) * GALLERY_PAGE_SIZE
  const rejectedFrom = (rejectedPage - 1) * REJECTED_PAGE_SIZE
  const activeTab: PhotoTab = query.tab === 'rejected'
    ? 'rejected'
    : query.tab === 'gallery'
    ? 'gallery'
    : query.tab === 'review'
    ? 'review'
    : stats.review > 0
    ? 'review'
    : 'gallery'

  let reviewPhotosQuery = supabase
    .from('photo_tags')
    .select('*')
    .eq('event_id', id)
    .eq('status', 'review')
  let galleryPhotosQuery = supabase
    .from('photo_tags')
    .select('*')
    .eq('event_id', id)
    .in('status', ['auto', 'confirmed'])
  let rejectedPhotosQuery = supabase
    .from('photo_tags')
    .select('*')
    .eq('event_id', id)
    .eq('status', 'discarded')

  if (selectedBatchId) {
    reviewPhotosQuery = reviewPhotosQuery.eq('batch_id', selectedBatchId)
    galleryPhotosQuery = galleryPhotosQuery.eq('batch_id', selectedBatchId)
    rejectedPhotosQuery = rejectedPhotosQuery.eq('batch_id', selectedBatchId)
  }

  const pagedReviewPhotosQuery = reviewPhotosQuery
    .order('created_at', { ascending: false })
    .range(reviewFrom, reviewFrom + REVIEW_PAGE_SIZE - 1)
  const pagedGalleryPhotosQuery = galleryPhotosQuery
    .order('created_at', { ascending: false })
    .range(galleryFrom, galleryFrom + GALLERY_PAGE_SIZE - 1)
  const pagedRejectedPhotosQuery = rejectedPhotosQuery
    .order('created_at', { ascending: false })
    .range(rejectedFrom, rejectedFrom + REJECTED_PAGE_SIZE - 1)

  const [
    reviewPhotosResult,
    galleryPhotosResult,
    rejectedPhotosResult,
  ] = await Promise.all([
    pagedReviewPhotosQuery,
    pagedGalleryPhotosQuery,
    pagedRejectedPhotosQuery,
  ])

  const reviewStoragePaths = Array.from(
    new Set(
      (reviewPhotosResult.data ?? [])
        .map((photo) => photo.storage_path)
        .filter((storagePath): storagePath is string => Boolean(storagePath))
    )
  )
  const reviewStoragePathSet = new Set(reviewStoragePaths)
  let reviewSiblingPhotosQuery = reviewStoragePaths.length > 0
    ? supabase
      .from('photo_tags')
      .select('*')
      .eq('event_id', id)
      .in('storage_path', reviewStoragePaths)
      .order('created_at', { ascending: true })
    : null

  if (reviewSiblingPhotosQuery && selectedBatchId) {
    reviewSiblingPhotosQuery = reviewSiblingPhotosQuery.eq('batch_id', selectedBatchId)
  }

  const reviewSiblingPhotosResult = reviewSiblingPhotosQuery
    ? await reviewSiblingPhotosQuery
    : { data: [], error: null }
  const galleryPhotoIds = new Set((galleryPhotosResult.data ?? []).map((photo) => photo.id))
  const rejectedPhotoIds = new Set((rejectedPhotosResult.data ?? []).map((photo) => photo.id))
  const photosById = new Map(
    [
      ...(reviewPhotosResult.data ?? []),
      ...(reviewSiblingPhotosResult.data ?? []),
      ...(galleryPhotosResult.data ?? []),
      ...(rejectedPhotosResult.data ?? []),
    ].map((photo) => [photo.id, photo])
  )
  const photos = Array.from(photosById.values())
  const photosError =
    totalCountResult.error ??
    autoCountResult.error ??
    reviewCountResult.error ??
    confirmedCountResult.error ??
    galleryCountResult.error ??
    rejectedCountResult.error ??
    reviewPhotosResult.error ??
    reviewSiblingPhotosResult.error ??
    galleryPhotosResult.error ??
    rejectedPhotosResult.error

  const registrationIds = Array.from(
    new Set(
      photos
        .map((photo) => photo.registration_id)
        .filter((registrationId): registrationId is string => Boolean(registrationId))
    )
  )
  const runnerIds = Array.from(
    new Set(
      photos
        .map((photo) => photo.runner_id)
        .filter((runnerId): runnerId is string => Boolean(runnerId))
    )
  )

  const { data: registrations } = registrationIds.length > 0
    ? await supabase
      .from('registrations')
      .select('id, bib_number')
      .in('id', registrationIds)
    : { data: [] }

  const { data: runners } = runnerIds.length > 0
    ? await supabase
      .from('runner_profiles')
      .select('id, full_name')
      .in('id', runnerIds)
    : { data: [] }

  const registrationById = new Map(
    (registrations ?? []).map((registration) => [registration.id, registration])
  )
  const runnerById = new Map(
    (runners ?? []).map((runner) => [runner.id, runner])
  )

  // Generate signed URLs for photos that have a storage path
  const photosWithUrls = await Promise.all(
    (photos ?? []).map(async (photo) => {
      const registration = photo.registration_id
        ? registrationById.get(photo.registration_id) ?? null
        : null
      const runner = photo.runner_id
        ? runnerById.get(photo.runner_id) ?? null
        : null

      if (!photo.storage_path) return { ...photo, registration, runner, url: null }
      const { data } = await supabase.storage
        .from('race-photos')
        .createSignedUrl(photo.storage_path, 3600) // 1h expiry
      return {
        ...photo,
        registration,
        runner,
        fileName: photo.storage_path.split('/').pop() ?? 'Uploaded photo',
        url: data?.signedUrl ?? null,
      }
    })
  )
  const reviewPhotos = photosWithUrls.filter((photo) =>
    Boolean(photo.storage_path && reviewStoragePathSet.has(photo.storage_path))
  )
  const galleryPhotos = photosWithUrls.filter((photo) =>
    galleryPhotoIds.has(photo.id) && (photo.status === 'auto' || photo.status === 'confirmed')
  )
  const rejectedPhotos = photosWithUrls.filter((photo) =>
    rejectedPhotoIds.has(photo.id) && photo.status === 'discarded'
  )
  type PhotoWithUrl = (typeof photosWithUrls)[number]
  type PhotoGroup = PhotoWithUrl & {
    bibNumbers: string[]
    tagCount: number
    tags: PhotoWithUrl[]
  }

  function getBibBadgeClass(photo: PhotoWithUrl) {
    if (photo.status === 'discarded') {
      return 'border-destructive/60 bg-destructive/10 text-destructive'
    }

    if (photo.status === 'auto' || photo.status === 'confirmed' || photo.registration_id) {
      return 'border-green-500/60 bg-green-500/10 text-green-500'
    }

    return ''
  }

  function getTagMatchText(photo: PhotoWithUrl) {
    if (photo.runner?.full_name) return photo.runner.full_name
    if (photo.registration_id) return 'Matched registration'
    return 'No registration match found'
  }

  function groupPhotosByStoragePath(sourcePhotos: PhotoWithUrl[]) {
    return Array.from(
      sourcePhotos.reduce((groups: Map<string, PhotoGroup>, photo: PhotoWithUrl) => {
        const groupKey = photo.storage_path || photo.id
        const currentGroup = groups.get(groupKey)

        if (currentGroup) {
          currentGroup.tags.push(photo)

          if (photo.bib_number && !currentGroup.bibNumbers.includes(photo.bib_number)) {
            currentGroup.bibNumbers.push(photo.bib_number)
          }

          currentGroup.tagCount += 1

          if (
            photo.confidence != null &&
            (currentGroup.confidence == null || photo.confidence > currentGroup.confidence)
          ) {
            currentGroup.confidence = photo.confidence
          }
        } else {
          groups.set(groupKey, {
            ...photo,
            bibNumbers: photo.bib_number ? [photo.bib_number] : [],
            tagCount: 1,
            tags: [photo],
          })
        }

        return groups
      }, new Map<string, PhotoGroup>())
        .values()
    )
  }

  const reviewPhotoGroups = groupPhotosByStoragePath(reviewPhotos)
  const rejectedPhotoGroups = groupPhotosByStoragePath(rejectedPhotos)

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

      {photosError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-destructive">Could not load photo tags</p>
            <p className="mt-1 text-xs text-muted-foreground">{photosError.message}</p>
          </CardContent>
        </Card>
      )}

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

      <PhotoBatchFilter batches={batchOptions} selectedBatchId={selectedBatchId} />

      <Tabs defaultValue={activeTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="review">
              Review Queue
              <Badge variant="secondary" className="ml-1">
                {stats.review}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="gallery">
              Photo Gallery
              <Badge variant="outline" className="ml-1">
                {galleryCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected
              <Badge variant="outline" className="ml-1">
                {rejectedCount}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="review">
          <Card className="border-border">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Review Queue</CardTitle>
                  <CardDescription>Photos that need organizer confirmation before runners see them</CardDescription>
                </div>
                <Badge variant={reviewPhotos.length > 0 ? 'secondary' : 'outline'}>
                  {stats.review} need review
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <PhotoPaginationControls
                eventId={id}
                tab="review"
                currentPage={reviewPage}
                reviewPage={reviewPage}
                galleryPage={galleryPage}
                rejectedPage={rejectedPage}
                total={stats.review}
                pageSize={REVIEW_PAGE_SIZE}
                batchId={selectedBatchId}
              />
              {reviewPhotoGroups.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {reviewPhotoGroups.map((photo) => (
                    <div
                      key={photo.id}
                      className="overflow-hidden rounded-lg border border-border bg-card"
                    >
                      <PhotoPreviewDialog
                        src={photo.url}
                        alt={`Review photo for BIB ${photo.bib_number ?? 'unknown'}`}
                        title="Review photo preview"
                        description={photo.fileName}
                        thumbnailClassName="relative aspect-[4/3] w-full bg-secondary"
                        thumbnailImageClassName="object-contain"
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      >
                        {photo.confidence != null && (
                          <Badge variant="outline" className="absolute right-3 top-3 bg-background/85">
                            {(photo.confidence * 100).toFixed(0)}%
                          </Badge>
                        )}
                      </PhotoPreviewDialog>
                      <div className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground">
                              Detected BIBs
                            </p>
                            {photo.tags.some((tag) => tag.bib_number) ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {photo.tags
                                  .filter((tag) => tag.bib_number)
                                  .map((tag) => (
                                  <Badge
                                    key={tag.id}
                                    variant="outline"
                                    className={`text-base font-semibold ${getBibBadgeClass(tag)}`}
                                  >
                                    {tag.bib_number}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-2xl font-semibold leading-none">Unknown</p>
                            )}
                          </div>
                          <Badge variant="secondary">
                            {photo.tagCount} tag{photo.tagCount !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {photo.tags.map((tag) => (
                            <div
                              key={tag.id}
                              className="space-y-3 rounded-md border border-border bg-background/40 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-sm font-semibold ${getBibBadgeClass(tag)}`}
                                  >
                                    {tag.bib_number || 'Unknown'}
                                  </Badge>
                                  <div>
                                    <p className="text-sm font-medium">{getTagMatchText(tag)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {tag.status === 'review'
                                        ? tag.registration_id
                                          ? 'Ready for confirmation'
                                          : 'Waiting for manual match or bib correction'
                                        : tag.status}
                                    </p>
                                  </div>
                                </div>
                                {tag.status !== 'review' && (
                                  <Badge
                                    variant={tag.status === 'discarded' ? 'outline' : 'default'}
                                    className={getBibBadgeClass(tag)}
                                  >
                                    {tag.status}
                                  </Badge>
                                )}
                              </div>
                              {tag.status === 'review' && (
                                <PhotoReviewActions
                                  eventId={id}
                                  photoTagId={tag.id}
                                  storagePath={tag.storage_path}
                                  detectedBib={tag.bib_number}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span className="truncate" title={photo.storage_path}>
                            {photo.fileName}
                          </span>
                          <span className="shrink-0">Storage saved</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border py-10 text-center">
                  <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
                  <p className="text-sm font-medium">No photos need review</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review items will appear here after auto tagging.
                  </p>
                </div>
              )}
              {reviewPhotoGroups.length > 0 && (
                <PhotoPaginationControls
                  eventId={id}
                  tab="review"
                  currentPage={reviewPage}
                  reviewPage={reviewPage}
                  galleryPage={galleryPage}
                  rejectedPage={rejectedPage}
                  total={stats.review}
                  pageSize={REVIEW_PAGE_SIZE}
                  batchId={selectedBatchId}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Photo Gallery</CardTitle>
              <CardDescription>Auto-tagged and confirmed photos from this event</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PhotoPaginationControls
                eventId={id}
                tab="gallery"
                currentPage={galleryPage}
                reviewPage={reviewPage}
                galleryPage={galleryPage}
                rejectedPage={rejectedPage}
                total={galleryCount}
                pageSize={GALLERY_PAGE_SIZE}
                batchId={selectedBatchId}
              />
              {galleryPhotos.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {galleryPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative aspect-square overflow-hidden rounded-lg bg-secondary"
                    >
                      <PhotoPreviewDialog
                        src={photo.url}
                        alt={`BIB ${photo.bib_number ?? 'unknown'}`}
                        title="Gallery photo preview"
                        description={photo.fileName}
                        thumbnailClassName="absolute inset-0 bg-secondary"
                        thumbnailImageClassName="object-cover"
                        sizes="(max-width: 768px) 50vw, 16vw"
                      />
                      <div className="absolute bottom-0 left-0 right-0 z-10 p-2 bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-white text-xs font-medium">
                          {photo.runner?.full_name || 'Unmatched runner'}
                        </p>
                        <p className="text-white/80 text-xs">
                          BIB: {photo.bib_number || 'N/A'}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge
                            variant={
                              photo.status === 'confirmed'
                                ? 'default'
                                : photo.status === 'review'
                                ? 'secondary'
                                : 'outline'
                            }
                            className="text-xs"
                          >
                            {photo.status}
                          </Badge>
                          {photo.registration_id && (
                            <Badge variant="outline" className="bg-background/80 text-xs">
                              matched
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2">
                          <PhotoGalleryTagActions eventId={id} photoTagId={photo.id} />
                        </div>
                      </div>
                      {photo.confidence != null && (
                        <div className="absolute top-2 right-2 z-10">
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
                  <p className="text-muted-foreground">No photos ready for gallery yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Auto-tagged and confirmed photos will appear here.
                  </p>
                </div>
              )}
              {galleryPhotos.length > 0 && (
                <PhotoPaginationControls
                  eventId={id}
                  tab="gallery"
                  currentPage={galleryPage}
                  reviewPage={reviewPage}
                  galleryPage={galleryPage}
                  rejectedPage={rejectedPage}
                  total={galleryCount}
                  pageSize={GALLERY_PAGE_SIZE}
                  batchId={selectedBatchId}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card className="border-border">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Rejected</CardTitle>
                  <CardDescription>Tags hidden from runner galleries but still recoverable</CardDescription>
                </div>
                <Badge variant={rejectedCount > 0 ? 'secondary' : 'outline'}>
                  {rejectedCount} rejected
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <PhotoPaginationControls
                eventId={id}
                tab="rejected"
                currentPage={rejectedPage}
                reviewPage={reviewPage}
                galleryPage={galleryPage}
                rejectedPage={rejectedPage}
                total={rejectedCount}
                pageSize={REJECTED_PAGE_SIZE}
                batchId={selectedBatchId}
              />
              {rejectedPhotoGroups.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {rejectedPhotoGroups.map((photo) => (
                    <div
                      key={photo.id}
                      className="overflow-hidden rounded-lg border border-border bg-card"
                    >
                      <PhotoPreviewDialog
                        src={photo.url}
                        alt={`Rejected photo for BIB ${photo.bib_number ?? 'unknown'}`}
                        title="Rejected photo preview"
                        description={photo.fileName}
                        thumbnailClassName="relative aspect-[4/3] w-full bg-secondary"
                        thumbnailImageClassName="object-contain opacity-75"
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      >
                        {photo.confidence != null && (
                          <Badge variant="outline" className="absolute right-3 top-3 bg-background/85">
                            {(photo.confidence * 100).toFixed(0)}%
                          </Badge>
                        )}
                      </PhotoPreviewDialog>
                      <div className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground">
                              Rejected BIBs
                            </p>
                            {photo.tags.some((tag) => tag.bib_number) ? (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {photo.tags
                                  .filter((tag) => tag.bib_number)
                                  .map((tag) => (
                                  <Badge
                                    key={tag.id}
                                    variant="outline"
                                    className={`text-base font-semibold ${getBibBadgeClass(tag)}`}
                                  >
                                    {tag.bib_number}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-2xl font-semibold leading-none">Unknown</p>
                            )}
                          </div>
                          <Badge variant="outline">
                            {photo.tagCount} tag{photo.tagCount !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="rounded-md border border-dashed border-border p-3">
                          <p className="text-sm font-medium">Rejected tags are hidden</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Restore this image if the tags should return to manual review.
                          </p>
                        </div>
                        <PhotoRestoreActions
                          eventId={id}
                          storagePath={photo.storage_path}
                        />
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span className="truncate" title={photo.storage_path}>
                            {photo.fileName}
                          </span>
                          <span className="shrink-0">Storage saved</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border py-10 text-center">
                  <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
                  <p className="text-sm font-medium">No rejected tags</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Rejected tags will appear here for recovery.
                  </p>
                </div>
              )}
              {rejectedPhotoGroups.length > 0 && (
                <PhotoPaginationControls
                  eventId={id}
                  tab="rejected"
                  currentPage={rejectedPage}
                  reviewPage={reviewPage}
                  galleryPage={galleryPage}
                  rejectedPage={rejectedPage}
                  total={rejectedCount}
                  pageSize={REJECTED_PAGE_SIZE}
                  batchId={selectedBatchId}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
