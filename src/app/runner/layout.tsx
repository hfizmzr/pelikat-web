'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import Link from 'next/link'
import { PWAInstallPrompt } from '@/components/pwa/install-prompt'

function BottomNavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string
  icon: string
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] gap-0.5 transition-all active:scale-95 ${
        active
          ? 'text-[#d0bcff] font-semibold'
          : 'text-[#cbc3d7] hover:text-[#e5e1e4]'
      }`}
    >
      <span
        className="material-symbols-outlined text-[20px]"
        style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
      >
        {icon}
      </span>
      <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold">
        {label}
      </span>
    </Link>
  )
}

const NAV_ITEMS = [
  { href: '/runner', icon: 'home', label: 'Home' },
  { href: '/runner/events', icon: 'search', label: 'Explore' },
  { href: '/runner/run-log', icon: 'activity_zone', label: 'Activity' },
  { href: '/runner/badges', icon: 'local_police', label: 'Badges' },
  { href: '/runner/profile', icon: 'person', label: 'Profile' },
] as const

export default function RunnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
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
    // Detect standalone PWA mode
    const checkIsStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone)
    setIsStandalone(checkIsStandalone)
  }, [])

  // Show nothing while checking display mode to avoid flicker
  if (isStandalone === null) return null

  // If not standalone, force the installation prompt
  if (!isStandalone) {
    return <PWAInstallPrompt />
  }

  return (
    <div className="min-h-screen bg-[#0e0e10] flex justify-center overflow-hidden font-sans">
      <div className="flex flex-col w-full max-w-md h-[100dvh] bg-[#131315] overscroll-none select-none relative shadow-2xl border-x border-[#23232b]/30">
        {/* Main scrollable content area - padded for bottom nav */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-28 pt-0">{children}</main>

        {/* Floating pill bottom nav */}
        <nav className="absolute bottom-0 inset-x-0 z-50 pb-safe pointer-events-none flex justify-center pb-3 px-4">
          <div className="pointer-events-auto w-full bg-[#1c1b1d]/90 backdrop-blur-2xl rounded-full px-2 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.65)] flex items-center justify-around border border-[#353437]/60">
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