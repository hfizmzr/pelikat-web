'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, Loader2, CheckCircle2, AlertCircle, ImageIcon, X } from 'lucide-react'
import {
  triggerPhotoProcessing,
  triggerPhotoProcessingForPrefix,
} from '@/components/events/actions'
import type { PhotoBatch } from '@/lib/photo-batches'

interface PhotoUploaderProps {
  eventId: string
}

type UploadState = 'idle' | 'uploading' | 'queuing' | 'queued' | 'error'
type ExistingBatch = { id: string; prefix: string }

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

/** Reprocess confirmation dialog, shared by both uploader screens. */
function ReprocessConfirm({
  trigger,
  title,
  description,
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Reprocess Uploads
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function PhotoUploader({ eventId }: PhotoUploaderProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [queuedBatch, setQueuedBatch] = useState<PhotoBatch | null>(null)
  const [storagePaths, setStoragePaths] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [existingBatches, setExistingBatches] = useState<ExistingBatch[]>([])
  const [selectedExistingPrefix, setSelectedExistingPrefix] = useState<string | null>(null)
  const [isLoadingBatches, setIsLoadingBatches] = useState(false)
  const [showExistingTools, setShowExistingTools] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    const supabase = createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setState('error')
      setErrorMsg('You must be signed in to upload race photos.')
      return
    }

    const nextBatchId = crypto.randomUUID()
    setCurrentUserId(userData.user.id)

    setState('uploading')
    setTotalCount(fileArray.length)
    setUploadedCount(0)
    setProgress(0)
    setErrorMsg(null)
    setBatchId(nextBatchId)
    setQueuedBatch(null)
    setStoragePaths([])

    const paths: string[] = []

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        // The batch folder plus the index keep every path unique.
        const path = `${userData.user.id}/${eventId}/${nextBatchId}/${i}-${safeName}`

        const { error } = await supabase.storage
          .from('race-photos')
          .upload(path, file, { upsert: false })

        if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`)

        paths.push(path)
        setUploadedCount(i + 1)
        setProgress(Math.round(((i + 1) / fileArray.length) * 100))
      }

      setStoragePaths(paths)
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Upload failed'))
      setState('error')
      return
    }

    queueAutoTagging(() => triggerPhotoProcessing(eventId, paths, nextBatchId))
  }

  // Both entry points only queue the batch; the photo worker tags it in the
  // background and the Processing Batches list tracks it (FR-16 / FR-20).
  const queueAutoTagging = (trigger: () => Promise<PhotoBatch>) => {
    setState('queuing')
    setErrorMsg(null)

    startTransition(async () => {
      try {
        setQueuedBatch(await trigger())
        setState('queued')
        router.refresh()
      } catch (err: unknown) {
        setErrorMsg(getErrorMessage(err, 'Could not queue AI tagging'))
        setState('error')
      }
    })
  }

  // Same batch id as the failed attempt: if Django did queue it, this
  // returns that batch instead of queuing the photos twice.
  const handleRetryQueue = () => {
    if (!batchId || storagePaths.length === 0) return

    queueAutoTagging(() => triggerPhotoProcessing(eventId, storagePaths, batchId))
  }

  const handleLoadExistingBatches = async () => {
    const supabase = createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData.user) {
      setState('error')
      setErrorMsg('You must be signed in to load existing uploads.')
      return
    }

    setIsLoadingBatches(true)
    setShowExistingTools(true)
    setErrorMsg(null)

    try {
      const eventPrefix = `${userData.user.id}/${eventId}`
      const { data, error } = await supabase.storage
        .from('race-photos')
        .list(eventPrefix, { limit: 1000 })

      if (error) throw new Error(error.message)

      const batches = (data ?? [])
        .filter((entry) => entry.name && !entry.name.includes('.'))
        .map((entry) => ({
          id: entry.name,
          prefix: `${eventPrefix}/${entry.name}`,
        }))

      setCurrentUserId(userData.user.id)
      setExistingBatches(batches)
      setSelectedExistingPrefix(eventPrefix)

      if (batches.length === 0) {
        setErrorMsg('No existing uploaded batches found for this event.')
      }
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Could not load existing uploaded batches.'))
    } finally {
      setIsLoadingBatches(false)
    }
  }

  const handleRunExistingAutoTagging = async () => {
    if (!selectedExistingPrefix) {
      await handleLoadExistingBatches()
      return
    }

    const nextBatchId = crypto.randomUUID()
    setBatchId(nextBatchId)
    setQueuedBatch(null)
    setStoragePaths([])
    setUploadedCount(0)
    setTotalCount(0)

    queueAutoTagging(() => triggerPhotoProcessingForPrefix(eventId, selectedExistingPrefix, nextBatchId))
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleReset = () => {
    setState('idle')
    setProgress(0)
    setUploadedCount(0)
    setTotalCount(0)
    setBatchId(null)
    setQueuedBatch(null)
    setStoragePaths([])
    setCurrentUserId(null)
    setExistingBatches([])
    setSelectedExistingPrefix(null)
    setIsLoadingBatches(false)
    setShowExistingTools(false)
    setErrorMsg(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleHideExistingTools = () => {
    setShowExistingTools(false)
    setExistingBatches([])
    setSelectedExistingPrefix(null)
    setErrorMsg(null)
  }

  return (
    <div className="space-y-4">
      {state === 'idle' && (
        <div
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/30'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-base font-medium mb-1">Drop photos here or click to browse</p>
          <p className="text-sm text-muted-foreground">
            Supports JPG, PNG, WebP · up to 10 MB each · multiple files allowed
          </p>
          <Button variant="outline" className="mt-4" type="button">
            <Upload className="mr-2 h-4 w-4" />
            Select Photos
          </Button>
          {!showExistingTools && (
            <div className="mt-4" onClick={(event) => event.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={handleLoadExistingBatches}
                disabled={isLoadingBatches || isPending}
              >
                {isLoadingBatches ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 h-4 w-4" />
                )}
                Reprocess Existing Uploads
              </Button>
            </div>
          )}
          {showExistingTools && (
            <div
              className="mx-auto mt-5 w-full max-w-xl cursor-default rounded-md border border-border bg-background/80 p-4 text-left shadow-sm"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Reprocess existing uploads</p>
                  <p className="text-xs text-muted-foreground">
                    Choose one uploaded batch, or run AI tagging on all uploaded photos for this event.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="h-8 w-8 shrink-0"
                  onClick={handleHideExistingTools}
                  aria-label="Close existing upload controls"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={selectedExistingPrefix ?? undefined}
                  onValueChange={setSelectedExistingPrefix}
                  disabled={isLoadingBatches}
                >
                  <SelectTrigger size="sm" className="w-full sm:flex-1">
                    <SelectValue placeholder="Choose uploaded batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUserId && (
                      <SelectItem value={`${currentUserId}/${eventId}`}>
                        All batches for this event
                      </SelectItem>
                    )}
                    {existingBatches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.prefix}>
                        Batch {batch.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleLoadExistingBatches}
                  disabled={isLoadingBatches || isPending}
                >
                  {isLoadingBatches ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="mr-2 h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ReprocessConfirm
                  trigger={
                    <Button size="sm" type="button" disabled={isPending || !selectedExistingPrefix}>
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Reprocess Uploads
                    </Button>
                  }
                  title="Reprocess uploads?"
                  description="This queues the selected upload folder for AI tagging again and replaces earlier AI tags for the same images. Tags you confirmed or rejected are kept, and runner galleries won't get duplicate photos."
                  onConfirm={handleRunExistingAutoTagging}
                />

                {existingBatches.length > 0 && (
                  <Badge variant="outline">
                    {existingBatches.length} batch{existingBatches.length !== 1 ? 'es' : ''} found
                  </Badge>
                )}
              </div>

              {errorMsg && state === 'idle' && (
                <p className="mt-3 text-xs text-destructive">{errorMsg}</p>
              )}
            </div>
          )}
        </div>
      )}

      {(state === 'uploading' || state === 'queuing') && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">
                {state === 'uploading'
                  ? `Uploading photos… (${uploadedCount}/${totalCount})`
                  : 'Queuing photos for AI tagging…'}
              </p>
              <p className="text-xs text-muted-foreground">
                {state === 'uploading' ? 'Please keep this page open until the upload finishes' : 'Almost done'}
              </p>
            </div>
          </div>
          {state === 'uploading' && (
            <>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </>
          )}
        </div>
      )}

      {state === 'queued' && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                {queuedBatch?.total ?? 0} photo{queuedBatch?.total !== 1 ? 's' : ''} queued for AI tagging
              </p>
              {batchId && (
                <p className="text-xs text-muted-foreground">Batch {batchId.slice(0, 8)}</p>
              )}
            </div>
            <Badge variant="outline" className="ml-auto">In background</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tagging runs in the background. You can leave this page; progress and results show under
            Processing Batches.
          </p>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Upload More Photos
          </Button>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {storagePaths.length > 0 || currentUserId ? 'Could not queue AI tagging' : 'Upload failed'}
              </p>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {storagePaths.length > 0 && (
              <Button size="sm" onClick={handleRetryQueue} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 h-4 w-4" />
                )}
                Retry Queuing
              </Button>
            )}
            <ReprocessConfirm
              trigger={
                <Button variant="outline" size="sm" disabled={isPending || !selectedExistingPrefix}>
                Reprocess Existing Uploads
                </Button>
              }
              title="Run auto tagging again?"
              description="This queues the selected upload folder for AI tagging again. Tags you confirmed or rejected are kept."
              onConfirm={handleRunExistingAutoTagging}
            />
            <Button variant="outline" size="sm" onClick={handleReset}>
              Upload Different Photos
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
