'use client'

import { Badge, Camera, CircleAlert, CloudUpload, FolderOpen, LoaderCircle, ShieldCheck, Trash2, TriangleAlert } from "lucide-react"
import { useState, useRef, useCallback } from 'react'
import { storeEncryptedDocument, deleteDocument } from '@/lib/actions/account'

interface Props {
  userId: string
  currentDocument: {
    path: string | null
    mime: string | null
  }
}

export default function DocumentCapture({ currentDocument }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [rawFile, setRawFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [encrypting, setEncrypting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [hasDocument, setHasDocument] = useState(!!currentDocument.path)

  const resizeImage = useCallback(
    (file: File): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          URL.revokeObjectURL(url)
          const maxDim = 1920
          let { width, height } = img
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob)
              else reject(new Error('Canvas toBlob failed'))
            },
            'image/jpeg',
            0.85
          )
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = url
      })
    },
    []
  )

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setWarning(null)
      setRawFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    },
    []
  )

  const handleUpload = async () => {
    if (!rawFile) return

    setEncrypting(true)
    setError(null)
    setWarning(null)

    try {
      const resized = await resizeImage(rawFile)

      const formData = new FormData()
      formData.append('document', resized, 'ic.jpg')

      const response = await fetch('/api/documents/encrypt', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      await storeEncryptedDocument({
        encrypted_path: result.encrypted_path,
        ic_encrypted: result.ic_encrypted,
      })

      if (result.warning) {
        setWarning(result.warning)
      }

      setHasDocument(true)
      setRawFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setEncrypting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    setWarning(null)

    try {
      await deleteDocument(currentDocument.path)
      setHasDocument(false)
      setPreviewUrl(null)
      setRawFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="p-5 border-b border-border/60">
        <h3 className="text-[16px] font-bold text-foreground flex items-center gap-2">
          <Badge className="size-[20px] text-primary" />
          Identification Document
        </h3>
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
          Upload a photo of your IC or Passport for identity verification.
          Your document is validated, encrypted, and stored securely.
        </p>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {hasDocument ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/20 px-4 py-3 text-[13px] text-success font-medium">
              <ShieldCheck className="size-[18px]" />
              Document securely stored
            </div>
            
            {warning && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 dark:bg-amber-500 dark:bg-amber-400/10 border border-amber-500/30 dark:border-amber-500 dark:border-amber-400/20 px-4 py-3 text-[13px] text-amber-500 dark:text-amber-400">
                <TriangleAlert className="size-[18px]" />
                {warning}
              </div>
            )}
            
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="py-3 px-4 w-full rounded-xl border border-red-500/40 dark:border-red-500 dark:border-red-300/30 text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-500 dark:bg-red-300/5 text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              {deleting ? (
                <>
                  <LoaderCircle className="animate-spin size-[16px]" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="size-[16px]" />
                  Remove Document
                </>
              )}
            </button>
          </div>
        ) : previewUrl ? (
          <div className="flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background">
              {/* Local blob preview — next/image adds no benefit for object URLs */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="IC/Passport preview"
                className="max-h-48 w-full object-contain"
              />
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={handleUpload} 
                disabled={encrypting}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
              >
                {encrypting ? (
                  <>
                    <LoaderCircle className="animate-spin size-[16px]" />
                    Validating...
                  </>
                ) : (
                  <>
                    <CloudUpload className="size-[16px]" />
                    Save Document
                  </>
                )}
              </button>
              
              <button
                onClick={() => {
                  setRawFile(null)
                  setPreviewUrl(null)
                }}
                disabled={encrypting}
                className="py-3 px-6 rounded-xl bg-accent text-foreground text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-3.5 px-2 rounded-xl border border-border text-muted-foreground bg-muted text-[13px] font-bold flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
              >
                <FolderOpen className="size-[24px]" />
                Upload File
              </button>
              
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="py-3.5 px-2 rounded-xl border border-border text-muted-foreground bg-muted text-[13px] font-bold flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
              >
                <Camera className="size-[24px]" />
                Take Photo
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />

            <p className="text-[11px] text-muted-foreground text-center">
              Accepted formats: JPEG, PNG, WebP. Max 10MB.<br/>
              Image will be resized and validated before storage.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 dark:bg-red-500 dark:bg-red-300/10 border border-red-500/30 dark:border-red-500 dark:border-red-300/20 text-red-500 dark:text-red-300 text-[12px] flex items-center gap-2">
            <CircleAlert className="size-[16px]" />
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
