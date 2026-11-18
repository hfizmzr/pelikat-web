'use client'

import type { LucideIcon } from "lucide-react"
import { ScanLine, Calendar, Gauge, House, ShoppingBag } from "lucide-react"
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import Link from 'next/link'

function BottomNavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string
  icon: LucideIcon
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] gap-1 transition-[color,transform] active:scale-[0.97] ${
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className={`size-5 ${active ? 'text-primary' : ''}`} strokeWidth={1.75} />
      <span className="text-[11px] leading-4 font-medium">
        {label}
      </span>
    </Link>
  )
}

const NAV_ITEMS = [
  { href: '/organizer/mobile', icon: House, label: 'Home' },
  { href: '/organizer/mobile/events', icon: Calendar, label: 'Events' },
  { href: '/organizer/mobile/scanner', icon: ScanLine, label: 'Scan' },
  { href: '/organizer/mobile/console', icon: Gauge, label: 'Console' },
  { href: '/organizer/mobile/merch', icon: ShoppingBag, label: 'Merch' },
] as const

export default function OrganizerMobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    async function checkRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const role = getUserRole(user)

      if (role !== 'organizer') {
        router.push('/login')
      }
    }
    checkRole()
  }, [router, supabase])

  return (
    <div className="min-h-dvh bg-background flex justify-center overflow-hidden">
      <div className="flex flex-col w-full max-w-md h-[100dvh] bg-background overscroll-none select-none relative sm:border-x sm:border-border/60">
        {/* Main scrollable content area - padded for bottom nav */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 pt-0">{children}</main>

        {/* Docked bottom nav */}
        <nav className="absolute bottom-0 inset-x-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="flex h-16 items-center justify-around px-2">
            {NAV_ITEMS.map((item) => {
              // Active if current path matches exactly or starts with (for sub-routes)
              const active =
                pathname === item.href ||
                (item.href !== '/organizer/mobile' &&
                  pathname.startsWith(item.href))
              return (
                <BottomNavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  active={active}
                />
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
