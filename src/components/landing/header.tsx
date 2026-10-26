"use client"

import Link from "next/link"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Menu, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Logo, navLinks } from "./nav"
import styles from "./landing.module.css"

function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  // false during SSR and hydration, true afterwards: the theme is unknown
  // until next-themes reads it on the client.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  const isDark = !mounted || resolvedTheme === "dark"
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex size-10 items-center justify-center rounded-[10px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  )
}

export function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header className={cn(styles.header, scrolled && styles.headerScrolled)}>
      <div className={cn(styles.container, "flex h-16 items-center justify-between gap-6")}>
        <Logo />

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(styles.link, "py-2 text-[14px] font-medium text-[var(--muted)]")}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeSwitch />
          <Link href="/login" className={cn(styles.btn, styles.btnGhost, styles.btnSm)}>
            Log in
          </Link>
          <Link href="/organizer/apply" className={cn(styles.btn, styles.btnPrimary, styles.btnSm)}>
            Apply as organizer
          </Link>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeSwitch />
          <Link href="/login" className={cn(styles.btn, styles.btnGhost, styles.btnSm)} style={{ paddingInline: 14 }}>
            Log in
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-[10px] hover:bg-[var(--surface-3)]"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] bg-background pb-[env(safe-area-inset-bottom)]">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              {/* SheetClose so tapping a link dismisses the menu; otherwise a
                  hash link only scrolls the page behind the open sheet. */}
              <nav className="flex flex-col gap-4 px-6 pt-16" aria-label="Mobile navigation">
                {navLinks.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <a href={link.href} className="rounded-lg py-3 text-[17px] font-medium">
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link href="/register" className="rounded-lg py-3 text-[17px] font-medium">
                    Create runner account
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href="/organizer/apply"
                    className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
                  >
                    Apply as organizer
                  </Link>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
