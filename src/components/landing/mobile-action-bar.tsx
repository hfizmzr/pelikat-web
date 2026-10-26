"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

// Thumb-reach actions for phones and the installed PWA. Appears once the
// hero's own buttons have scrolled away; hidden at lg and up via CSS.
export function MobileActionBar() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const cta = document.querySelector("[data-hero-cta]")
    if (!cta || !("IntersectionObserver" in window)) return
    const io = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0))
    io.observe(cta)
    return () => io.disconnect()
  }, [])

  return (
    <div className={cn(styles.mobileBar, shown && styles.mobileBarShown)} aria-hidden={!shown} inert={!shown}>
      <div className="mx-auto flex max-w-md gap-2">
        <Link href="/register" className={cn(styles.btn, styles.btnGhost, "flex-1")} style={{ paddingInline: 12 }}>
          I&apos;m a runner
        </Link>
        <Link href="/organizer/apply" className={cn(styles.btn, styles.btnPrimary, "flex-1")} style={{ paddingInline: 12 }}>
          Apply as organizer
        </Link>
      </div>
    </div>
  )
}
