'use client'

import { useRef, useState, useTransition } from 'react'
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
  type PhotoProcessingSummary,
} from '@/components/events/actions'

interface PhotoUploaderProps {
  eventId: string
  organizerId: string
}

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'processing' | 'done' | 'error'
type ExistingBatch = { id: string; prefix: string }

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function PhotoUploader({ eventId, organizerId }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [processingSummary, setProcessingSummary] = useState<PhotoProcessingSummary | null>(null)
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
    setProcessingSummary(null)
    setStoragePaths([])

    const paths: string[] = []

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${userData.user.id}/${eventId}/${nextBatchId}/${Date.now()}-${i}-${safeName}`

        const { error } = await supabase.storage
          .from('race-photos')
          .upload(path, file, { upsert: false })

        if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`)

        paths.push(path)
        setUploadedCount(i + 1)
        setProgress(Math.round(((i + 1) / fileArray.length) * 100))
      }

      setStoragePaths(paths)
      setState('uploaded')
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Upload failed'))
      setState('error')
    }
  }

  const handleRunAutoTagging = () => {
    if (!batchId || storagePaths.length === 0) return

    setState('processing')
    setProgress(90)
    setErrorMsg(null)

    startTransition(async () => {
      try {
        const summary = await triggerPhotoProcessing(eventId, organizerId, storagePaths, batchId)
        setProcessingSummary(summary)
        setProgress(100)
        setState('done')
      } catch (err: unknown) {
        setErrorMsg(getErrorMessage(err, 'AI processing trigger failed'))
        setState('error')
      }
    })
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
    setProcessingSummary(null)
    setStoragePaths([])
    setUploadedCount(0)
    setTotalCount(0)
    setProgress(90)
    setErrorMsg(null)
    setState('processing')

    startTransition(async () => {
      try {
        const summary = await triggerPhotoProcessingForPrefix(eventId, organizerId, selectedExistingPrefix, nextBatchId)
        setProcessingSummary(summary)
        setProgress(100)
        setState('done')
      } catch (err: unknown) {
        setErrorMsg(getErrorMessage(err, 'AI processing trigger failed'))
        setState('error')
      }
    })
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
    setProcessingSummary(null)
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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" type="button" disabled={isPending || !selectedExistingPrefix}>
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Reprocess Uploads
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reprocess uploads?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will reprocess the selected upload folder and replace existing AI tags for the same images.
                        Runner galleries will not receive duplicate rows for the same stored image.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRunExistingAutoTagging}>
                        Reprocess Uploads
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

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

      {(state === 'uploading' || state === 'processing') && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">
                {state === 'uploading'
                  ? `Uploading photos… (${uploadedCount}/${totalCount})`
                  : 'Running AI auto tagging…'}
              </p>
              <p className="text-xs text-muted-foreground">Please wait, do not close this page</p>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">{progress}%</p>
        </div>
      )}

      {state === 'uploaded' && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} uploaded to Supabase
              </p>
              {batchId && (
                <p className="text-xs text-muted-foreground">Batch ID: {batchId}</p>
              )}
            </div>
            <Badge variant="outline" className="ml-auto">Ready for AI</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleRunAutoTagging} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="mr-2 h-4 w-4" />
              )}
              Run Auto Tagging
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Upload Different Photos
            </Button>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                {uploadedCount > 0
                  ? `${uploadedCount} photo${uploadedCount !== 1 ? 's' : ''} uploaded and tagged successfully`
                  : 'Reprocessing completed for existing uploads'}
              </p>
              {batchId && (
                <p className="text-xs text-muted-foreground">Batch ID: {batchId}</p>
              )}
            </div>
            <Badge variant="outline" className="ml-auto">AI Tagging Complete</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            The AI pipeline finished and saved the batch results.
            Refresh the gallery below to see the latest results.
          </p>
          {processingSummary && (
            <div className="grid gap-2 sm:grid-cols-5">
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Processed</p>
                <p className="text-lg font-semibold">{processingSummary.processed}</p>
              </div>
              <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-xs text-muted-foreground">Auto-tagged</p>
                <p className="text-lg font-semibold text-green-600">{processingSummary.auto}</p>
              </div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs text-muted-foreground">Needs review</p>
                <p className="text-lg font-semibold text-amber-600">{processingSummary.review}</p>
              </div>
              <div className="rounded-md border border-muted bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">No match</p>
                <p className="text-lg font-semibold">{processingSummary.discarded}</p>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-lg font-semibold text-destructive">{processingSummary.failed}</p>
              </div>
            </div>
          )}
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
                {storagePaths.length > 0 || currentUserId ? 'Auto tagging failed' : 'Upload failed'}
              </p>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {storagePaths.length > 0 && (
              <Button size="sm" onClick={handleRunAutoTagging} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 h-4 w-4" />
                )}
                Retry Auto Tagging
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending || !selectedExistingPrefix}>
                Reprocess Existing Uploads
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Run auto tagging again?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reprocess the selected existing upload folder and replace previous AI tags for matching images.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRunExistingAutoTagging}>
                    Reprocess Uploads
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Upload Different Photos
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
