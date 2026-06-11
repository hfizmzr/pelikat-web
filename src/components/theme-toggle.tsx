"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className="relative h-11 w-11 rounded-full border border-border bg-transparent transition-colors hover:bg-secondary"
        aria-label="Toggle theme"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Sun className="size-[18px] text-muted-foreground" />
        </div>
      </button>
    )
  }

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="group relative h-11 w-11 rounded-full border border-border bg-transparent transition-all duration-300 hover:bg-secondary"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        <Sun
          className={`absolute size-[18px] text-muted-foreground transition-all duration-300 ${
            isDark
              ? "translate-y-0 opacity-100 rotate-0"
              : "-translate-y-1.5 opacity-0 -rotate-90"
          }`}
        />
        <Moon
          className={`absolute size-[18px] text-muted-foreground transition-all duration-300 ${
            isDark
              ? "translate-y-1.5 opacity-0 rotate-90"
              : "translate-y-0 opacity-100 rotate-0"
          }`}
        />
      </div>
    </button>
  )
}