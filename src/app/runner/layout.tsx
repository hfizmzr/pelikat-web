'use client'

import type { LucideIcon } from "lucide-react"
import { Activity, House, Search, Shield, User } from "lucide-react"
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { PWAInstallPrompt } from '@/components/pwa/install-prompt'
import { Toaster } from '@/components/ui/sonner'
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
  { href: '/runner', icon: House, label: 'Home' },
  { href: '/runner/events', icon: Search, label: 'Explore' },
  { href: '/runner/run-log', icon: Activity, label: 'Activity' },
  { href: '/runner/badges', icon: Shield, label: 'Badges' },
  { href: '/runner/profile', icon: User, label: 'Profile' },
] as const

export default function RunnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // Standalone-PWA gate. Release default: DISABLED (env flag must be set
  // explicitly to 'true' to activate); flip in the deploy env when shipping.
  const pwaGateEnabled = process.env.NEXT_PUBLIC_PWA_GATE === 'true'
  const [isStandalone, setIsStandalone] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      const role = getUserRole(user)

      if (role !== 'runner') {
        router.push('/')
      }
    }
    checkRole()
  }, [router, supabase])

  useEffect(() => {
    if (!pwaGateEnabled) return
    // Detect standalone PWA mode
    const navWithStandalone = navigator as Navigator & { standalone?: boolean }
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && !!navWithStandalone.standalone)
    )
  }, [pwaGateEnabled])

  // Show nothing while checking display mode to avoid flicker
  if (pwaGateEnabled && isStandalone === null) return null

  // If not standalone, force the installation prompt
  if (pwaGateEnabled && !isStandalone) {
    return <PWAInstallPrompt />
  }

  return (
    <div className="min-h-dvh bg-background flex justify-center overflow-hidden font-sans">
      <div className="flex flex-col w-full max-w-md h-[100dvh] bg-background overscroll-none select-none relative sm:border-x sm:border-border/60">
        {/* Main scrollable content area - padded for bottom nav */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-24 pt-0">{children}</main>

        {/* Docked bottom nav */}
        <nav className="absolute bottom-0 inset-x-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="flex h-16 items-center justify-around px-2">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/runner' && pathname.startsWith(item.href))
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
      <Toaster richColors position="top-center" />
    </div>
  )
}