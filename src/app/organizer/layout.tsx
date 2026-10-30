'use client'

import { Bell, CirclePlus } from "lucide-react"
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { OrganizerSidebar, OrganizerMobileNav } from '@/components/layout/organizer-sidebar'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/theme-toggle'

export default function OrganizerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const showSidebar =
    !pathname.startsWith('/organizer/subscription-expired') &&
    !pathname.startsWith('/organizer/payment') &&
    !pathname.startsWith('/organizer/mobile')

  useEffect(() => {
    // Detect standalone PWA mode
    const navWithStandalone = navigator as Navigator & { standalone?: boolean }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && !!navWithStandalone.standalone)
    if (isStandalone && !pathname.startsWith('/organizer/mobile')) {
      router.replace('/organizer/mobile')
    }
  }, [pathname, router])

  useEffect(() => {
    if (pathname.startsWith('/organizer/apply')) return
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      const role = getUserRole(user)

      if (role === 'expired') {
        if (!pathname.startsWith('/organizer/subscription-expired')) {
          router.push('/organizer/subscription-expired')
        }
        return
      }

      if (role !== 'organizer') {
        router.push('/')
        return
      }

      const { data: org } = await supabase
        .from('organizers')
        .select('sub_expires_at')
        .eq('id', user?.app_metadata?.organizer_id)
        .maybeSingle()

      if (org && !org.sub_expires_at && !pathname.startsWith('/organizer/payment')) {
        router.push('/organizer/payment')
      }
    }
    checkRole()
  }, [router, supabase, pathname])

  if (pathname.startsWith('/organizer/apply')) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Sidebar */}
      {showSidebar && (
        <div className="hidden lg:sticky lg:top-0 lg:h-dvh lg:flex lg:flex-col shrink-0">
          <OrganizerSidebar />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {showSidebar && (
          <header className="sticky top-0 z-40 bg-border/90 backdrop-blur-xl border-b border-muted px-6 h-16 flex items-center justify-between gap-4">
            {/* Mobile nav trigger */}
            <div className="lg:hidden">
              <OrganizerMobileNav />
            </div>

            {/* Left breadcrumb area */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] leading-[14px] tracking-[0.05em] text-primary font-semibold">
                  Organizer Hub
                </span>
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Notifications"
              >
                <Bell className="size-[20px]" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-border" />
              </button>
              <Link
                href="/organizer/events/new"
                className="px-4 py-1.5 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-primary transition-all "
              >
                <CirclePlus className="size-[16px]" />
                <span>Create Event</span>
              </Link>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      <Toaster richColors position="bottom-right" />
    </div>
  )
}