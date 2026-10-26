"use client"

import { useEffect } from "react"

// Adds .is-in to each [data-reveal] element once as it scrolls into view,
// and pauses looping video for visitors who prefer reduced motion.
export function RevealObserver() {
  useEffect(() => {
    document.documentElement.classList.add("js")
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]")

    // React sets `muted` as a property after hydration, so the browser's
    // autoplay attempt on the server HTML is blocked; start it here instead.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    document.querySelectorAll<HTMLVideoElement>("video[autoplay]").forEach((v) => {
      if (reduceMotion) {
        v.pause()
      } else {
        v.muted = true
        v.play().catch(() => {})
      }
    })

    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-in"))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in")
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    )
    targets.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return null
}
