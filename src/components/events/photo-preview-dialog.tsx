'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import { Maximize2, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface PhotoPreviewDialogProps {
  src: string | null
  alt: string
  title?: string
  description?: string
  sizes: string
  thumbnailClassName: string
  thumbnailImageClassName?: string
  previewImageClassName?: string
  children?: ReactNode
}

export function PhotoPreviewDialog({
  src,
  alt,
  title = 'Photo preview',
  description,
  sizes,
  thumbnailClassName,
  thumbnailImageClassName,
  previewImageClassName,
  children,
}: PhotoPreviewDialogProps) {
  if (!src) {
    return (
      <div className={thumbnailClassName}>
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="h-10 w-10 text-muted-foreground" />
        </div>
        {children}
      </div>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            thumbnailClassName,
            'group block overflow-hidden text-left outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
          aria-label={`Open larger view: ${alt}`}
        >
          <Image
            src={src}
            alt={alt}
            fill
            className={cn('transition duration-200 group-hover:scale-[1.01]', thumbnailImageClassName)}
            sizes={sizes}
          />
          <span className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/15 bg-black/55 p-1.5 text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="h-4 w-4" />
          </span>
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] border-border bg-background/95 p-3 sm:max-w-6xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? alt}</DialogDescription>
        </DialogHeader>
        <div className="relative h-[82vh] max-h-[82vh] w-full overflow-hidden rounded-md bg-black">
          <Image
            src={src}
            alt={alt}
            fill
            className={cn('object-contain', previewImageClassName)}
            sizes="100vw"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
