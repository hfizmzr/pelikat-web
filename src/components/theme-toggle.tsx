"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"

// false during SSR and hydration, true afterwards: the theme is unknown
// until next-themes reads it on the client.
function useMounted() {
  return useSyncExternalStore(() => () => {}, () => true, () => false)
}

/** Icon button for app headers (admin, organizer, organizer mobile). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()

  // Matches the app default (dark) until the stored choice is known.
  const isDark = !mounted || resolvedTheme === "dark"
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        className
      )}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <Sun className="size-[20px]" /> : <Moon className="size-[20px]" />}
    </button>
  )
}

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const

/** Two-option segmented control for settings screens (runner profile). */
export function ThemeSelect() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const current = mounted ? resolvedTheme : undefined

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted border border-border">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              "h-10 rounded-lg flex items-center justify-center gap-2 text-[13px] font-bold transition-colors",
              selected
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-[16px]" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
