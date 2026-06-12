"use client"

import Link from "next/link"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"

const navLinks = [
  { label: "Features", href: "#features", active: true },
  { label: "Runners", href: "#runners" },
  { label: "Organizers", href: "#organizers" },
]

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-semibold text-foreground">
            Pelikat Batik
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                link.active
                  ? "text-foreground underline underline-offset-4 decoration-primary decoration-2"
                  : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-4 md:flex">
          <ThemeToggle />
          <Link
              href="/login"
                className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Register
              </Link>
              <Button
                asChild
                className="mt-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/organizer/apply">Get Started</Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet>
          <SheetTrigger asChild className="md:hidden">
            <button
              type="button"
              className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-md hover:bg-accent"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] bg-background">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <div className="flex items-center gap-4 pt-8">
              <ThemeToggle />
            </div>
            <nav className="flex flex-col gap-4 pt-4" aria-label="Mobile navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`text-base font-medium transition-colors hover:text-foreground ${
                    link.active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <hr className="my-2 border-border" />
              <Link
                href="/login"
                className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Register
              </Link>
              <Button
                asChild
                className="mt-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/organizer/apply">Get Started</Link>
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
