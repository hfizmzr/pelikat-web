"use client"

import { useEffect } from "react"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

// Slow-drifting colour fields and grain behind the whole page.
export function AmbientBackground() {
  return (
    <div className={styles.ambient} aria-hidden="true">
      <div className={cn(styles.blob, styles.blobA)} />
      <div className={cn(styles.blob, styles.blobB)} />
      <div className={cn(styles.blob, styles.blobC)} />
      <div className={styles.grain} />
    </div>
  )
}

// Feeds the pointer position into [data-spotlight] cards as --mx / --my,
// which the .spot glow reads. Mouse and trackpad only.
export function SpotlightTracker() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return

    let frame = 0
    let last: PointerEvent | null = null

    const update = () => {
      frame = 0
      if (!last) return
      const card = (last.target as Element | null)?.closest<HTMLElement>("[data-spotlight]")
      if (!card) return
      const rect = card.getBoundingClientRect()
      card.style.setProperty("--mx", `${last.clientX - rect.left}px`)
      card.style.setProperty("--my", `${last.clientY - rect.top}px`)
    }
    const onMove = (e: PointerEvent) => {
      last = e
      if (!frame) frame = requestAnimationFrame(update)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
