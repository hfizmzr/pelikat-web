'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { storeEncryptedDocument, deleteDocument } from '@/lib/actions/account'

interface Props {
  userId: string
  currentDocument: {
    path: string | null
    mime: string | null
  }
}

export default function DocumentCapture({ userId, currentDocument }: Props) {
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
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Identification Document</CardTitle>
        <CardDescription>
          Upload a photo of your IC or Passport for identity verification.
          Your document is validated, encrypted, and stored securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasDocument ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Document securely stored
            </div>
            {warning && (
              <div className="flex items-center gap-2 rounded-md bg-yellow-50 dark:bg-yellow-950 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {warning}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {deleting ? 'Removing...' : 'Remove Document'}
            </Button>
          </div>
        ) : previewUrl ? (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-md border">
              <img
                src={previewUrl}
                alt="IC/Passport preview"
                className="max-h-64 w-full object-contain"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={encrypting}>
                {encrypting ? 'Validating & Encrypting...' : 'Save Document'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRawFile(null)
                  setPreviewUrl(null)
                }}
                disabled={encrypting}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload File
              </Button>
              <Button
                variant="outline"
                onClick={() => cameraInputRef.current?.click()}
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take Photo
              </Button>
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

            <p className="text-xs text-muted-foreground">
              Accepted formats: JPEG, PNG, WebP. Max 10MB. Image will be resized and validated before storage.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
