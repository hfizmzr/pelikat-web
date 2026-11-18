'use client'

import { Plus } from "lucide-react"
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { OrganizerSidebar, OrganizerMobileNav } from '@/components/layout/organizer-sidebar'
import { NotificationBell } from '@/components/notifications/notification-bell'
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
      let role = getUserRole(user)

      // The access-token hook syncs app_metadata after it answers, so right
      // after a renewal the stored role can still read 'expired' for a
      // moment. organizers.is_active is the source of truth the hook uses.
      if (role === 'expired') {
        const { data: org } = await supabase
          .from('organizers')
          .select('is_active')
          .eq('id', user?.app_metadata?.organizer_id)
          .maybeSingle()
        if (org?.is_active) role = 'organizer'
      }

      if (role === 'expired') {
        if (
          !pathname.startsWith('/organizer/subscription-expired') &&
          !pathname.startsWith('/organizer/payment')
        ) {
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
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-md sm:px-6">
            <div className="lg:hidden">
              <OrganizerMobileNav />
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              {/* Notifications inbox: same data source as the runner bell
              (notifications table, user-scoped RLS); links to the organizer
              inbox page instead of dead-spanning. */}
              <NotificationBell href="/organizer/notifications" />
              <Link
                href="/organizer/events/new"
                className="ml-2 flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[14px] font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
              >
                <Plus className="size-4" strokeWidth={2} />
                <span>Create event</span>
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