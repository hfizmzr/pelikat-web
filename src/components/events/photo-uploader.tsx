'use client'

import { useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Upload, Loader2, CheckCircle2, AlertCircle, ImageIcon } from 'lucide-react'
import { triggerPhotoProcessing } from '@/components/events/actions'

interface PhotoUploaderProps {
  eventId: string
  organizerId: string
}

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export function PhotoUploader({ eventId, organizerId }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    const supabase = createClient()

    setState('uploading')
    setTotalCount(fileArray.length)
    setUploadedCount(0)
    setProgress(0)
    setErrorMsg(null)
    setBatchId(null)

    const paths: string[] = []

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${eventId}/${Date.now()}-${safeName}`

        const { error } = await supabase.storage
          .from('race-photos')
          .upload(path, file, { upsert: false })

        if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`)

        paths.push(path)
        setUploadedCount(i + 1)
        setProgress(Math.round(((i + 1) / fileArray.length) * 80)) // 0–80% = uploading
      }

      setState('processing')
      setProgress(90)

      startTransition(async () => {
        try {
          const id = await triggerPhotoProcessing(eventId, organizerId, paths)
          setBatchId(id)
          setProgress(100)
          setState('done')
        } catch (err: any) {
          setErrorMsg(err.message || 'AI processing trigger failed')
          setState('error')
        }
      })
    } catch (err: any) {
      setErrorMsg(err.message || 'Upload failed')
      setState('error')
    }
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
    setErrorMsg(null)
    if (inputRef.current) inputRef.current.value = ''
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
                  : 'Triggering AI processing pipeline…'}
              </p>
              <p className="text-xs text-muted-foreground">Please wait, do not close this page</p>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">{progress}%</p>
        </div>
      )}

      {state === 'done' && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                {uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} uploaded successfully
              </p>
              {batchId && (
                <p className="text-xs text-muted-foreground">Batch ID: {batchId}</p>
              )}
            </div>
            <Badge variant="outline" className="ml-auto">AI Processing Queued</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            The AI pipeline will automatically detect BIB numbers and tag runners.
            Refresh the gallery below to see results as they appear.
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
              <p className="text-sm font-medium text-destructive">Upload failed</p>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Try Again
          </Button>
        </div>
      )}
    </div>
  )
}
