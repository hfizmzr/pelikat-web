'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import Link from 'next/link'

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
  { href: '/organizer/mobile', icon: 'home', label: 'Home' },
  { href: '/organizer/mobile/events', icon: 'calendar_today', label: 'Events' },
  { href: '/organizer/mobile/scanner', icon: 'badge', label: 'BIB Pass' },
  { href: '/organizer/mobile/console', icon: 'speed', label: 'Console' },
  { href: '/organizer/mobile/merch', icon: 'shopping_bag', label: 'Merch' },
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
    <div className="flex flex-col min-h-screen bg-[#131315] overscroll-none select-none">
      {/* Main scrollable content area - padded for bottom nav */}
      <main className="flex-1 overflow-y-auto pb-28 pt-0">{children}</main>

      {/* Floating pill bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 pb-safe pointer-events-none flex justify-center">
        <div className="pointer-events-auto mb-3 mx-4 w-full max-w-[420px] bg-[#1c1b1d]/90 backdrop-blur-2xl rounded-full px-2 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.65)] flex items-center justify-around border border-[#353437]/60">
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
  )
}
