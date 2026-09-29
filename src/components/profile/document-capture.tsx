'use client'

import { useState, useRef, useCallback } from 'react'
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
    <div className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden">
      <div className="p-5 border-b border-[#353437]/60">
        <h3 className="text-[16px] font-bold text-[#e5e1e4] flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#4cd7f6]">badge</span>
          Identification Document
        </h3>
        <p className="text-[12px] text-[#958ea0] mt-1 leading-relaxed">
          Upload a photo of your IC or Passport for identity verification.
          Your document is validated, encrypted, and stored securely.
        </p>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {hasDocument ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-xl bg-[#4edea3]/10 border border-[#4edea3]/20 px-4 py-3 text-[13px] text-[#4edea3] font-medium">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              Document securely stored
            </div>
            
            {warning && (
              <div className="flex items-center gap-2 rounded-xl bg-[#e3c45b]/10 border border-[#e3c45b]/20 px-4 py-3 text-[13px] text-[#e3c45b]">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                {warning}
              </div>
            )}
            
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="py-3 px-4 w-full rounded-xl border border-[#ffb4ab]/30 text-[#ffb4ab] bg-[#ffb4ab]/5 text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              {deleting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                  Removing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  Remove Document
                </>
              )}
            </button>
          </div>
        ) : previewUrl ? (
          <div className="flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-xl border border-[#353437]/60 bg-[#131315]">
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
                className="flex-1 py-3 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
              >
                {encrypting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Validating...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
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
                className="py-3 px-6 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-50"
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
                className="py-3.5 px-2 rounded-xl border border-[#353437] text-[#cbc3d7] bg-[#23232b] text-[13px] font-bold flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-[24px]">folder_open</span>
                Upload File
              </button>
              
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="py-3.5 px-2 rounded-xl border border-[#353437] text-[#cbc3d7] bg-[#23232b] text-[13px] font-bold flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-[24px]">photo_camera</span>
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

            <p className="text-[11px] text-[#958ea0] text-center">
              Accepted formats: JPEG, PNG, WebP. Max 10MB.<br/>
              Image will be resized and validated before storage.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
