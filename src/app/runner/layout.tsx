'use client'

import type { LucideIcon } from "lucide-react"
import { Activity, House, Search, Shield, User } from "lucide-react"
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { PWAInstallPrompt } from '@/components/pwa/install-prompt'
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
      className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] gap-0.5 transition-all active:scale-95 ${
        active
          ? 'text-primary font-semibold'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="size-[20px]" />
      <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold">
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
      <div className="flex flex-col w-full max-w-md h-[100dvh] bg-background overscroll-none select-none relative shadow-2xl border-x border-muted/30">
        {/* Main scrollable content area - padded for bottom nav */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-28 pt-0">{children}</main>

        {/* Floating pill bottom nav */}
        <nav className="absolute bottom-0 inset-x-0 z-50 pb-safe pointer-events-none flex justify-center pb-3 px-4">
          <div className="pointer-events-auto w-full bg-card/90 backdrop-blur-2xl rounded-full px-2 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.65)] flex items-center justify-around border border-border/60">
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
    </div>
  )
}