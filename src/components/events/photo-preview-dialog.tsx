'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent, ReactNode, WheelEvent } from 'react'
import Image from 'next/image'
import { ImageIcon, Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

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
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [hasMoved, setHasMoved] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const imageLayerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const zoomRef = useRef(MIN_ZOOM)
  const offsetRef = useRef({ x: 0, y: 0 })
  const dragStartRef = useRef<{
    pointerId: number
    x: number
    y: number
    offsetX: number
    offsetY: number
  } | null>(null)

  useEffect(() => {
    return () => {
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  function applyTransform() {
    if (animationFrameRef.current != null) return

    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null
      const imageLayer = imageLayerRef.current

      if (!imageLayer) return

      const { x, y } = offsetRef.current
      imageLayer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoomRef.current})`
    })
  }

  function resetZoom() {
    zoomRef.current = MIN_ZOOM
    offsetRef.current = { x: 0, y: 0 }
    dragStartRef.current = null
    setZoom(MIN_ZOOM)
    setHasMoved(false)
    setIsDragging(false)
    applyTransform()
  }

  function setZoomLevel(nextZoom: number) {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
    zoomRef.current = clampedZoom
    setZoom(clampedZoom)

    if (clampedZoom === MIN_ZOOM) {
      offsetRef.current = { x: 0, y: 0 }
      dragStartRef.current = null
      setHasMoved(false)
      setIsDragging(false)
    }

    applyTransform()
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoomLevel(Number((zoomRef.current + direction).toFixed(2)))
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (zoomRef.current <= MIN_ZOOM) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
    }
    setIsDragging(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current

    if (!dragStart || dragStart.pointerId !== event.pointerId) return

    offsetRef.current = {
      x: dragStart.offsetX + event.clientX - dragStart.x,
      y: dragStart.offsetY + event.clientY - dragStart.y,
    }

    if (!hasMoved) setHasMoved(true)
    applyTransform()
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStartRef.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      dragStartRef.current = null
      setIsDragging(false)
    }
  }

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
    <Dialog onOpenChange={(open) => !open && resetZoom()}>
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
        <div className="absolute left-5 top-5 z-10 flex items-center gap-1 rounded-md border border-white/15 bg-black/70 p-1 text-white shadow-sm">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
            onClick={() => setZoomLevel(Number((zoomRef.current - ZOOM_STEP).toFixed(2)))}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
            <span className="sr-only">Zoom out</span>
          </Button>
          <span className="min-w-12 text-center text-xs font-medium tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
            onClick={() => setZoomLevel(Number((zoomRef.current + ZOOM_STEP).toFixed(2)))}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
            <span className="sr-only">Zoom in</span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/15 hover:text-white"
            onClick={resetZoom}
            disabled={zoom === MIN_ZOOM && !hasMoved}
            title="Reset zoom"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="sr-only">Reset zoom</span>
          </Button>
        </div>
        <div
          className={cn(
            'relative h-[82vh] max-h-[82vh] w-full touch-none overflow-hidden rounded-md bg-black',
            zoom > MIN_ZOOM && (isDragging ? 'cursor-grabbing' : 'cursor-grab')
          )}
          onDoubleClick={() => (zoomRef.current > MIN_ZOOM ? resetZoom() : setZoomLevel(2))}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <div ref={imageLayerRef} className="absolute inset-0 will-change-transform">
            <Image
              src={src}
              alt={alt}
              fill
              draggable={false}
              className={cn('select-none object-contain', previewImageClassName)}
              sizes="100vw"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
