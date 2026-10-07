'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { OrganizerSidebar, OrganizerMobileNav } from '@/components/layout/organizer-sidebar'
import { Toaster } from '@/components/ui/sonner'

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
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone)
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
    <div className="flex min-h-screen bg-[#131315]">
      {/* Sidebar */}
      {showSidebar && (
        <div className="hidden lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col shrink-0">
          <OrganizerSidebar />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {showSidebar && (
          <header className="sticky top-0 z-40 bg-[#0f0f13]/90 backdrop-blur-xl border-b border-[#23232b] px-6 h-16 flex items-center justify-between gap-4">
            {/* Mobile nav trigger */}
            <div className="lg:hidden">
              <OrganizerMobileNav />
            </div>

            {/* Left breadcrumb area */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d0bcff]/10 border border-[#d0bcff]/20">
                <span className="w-2 h-2 rounded-full bg-[#d0bcff] animate-pulse" />
                <span className="text-[10px] leading-[14px] tracking-[0.05em] text-[#e9ddff] font-semibold">
                  Organizer Hub
                </span>
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <button
                className="relative p-2 rounded-lg text-[#cbc3d7] hover:text-[#e5e1e4] hover:bg-[#2a2a2c] transition-colors"
                title="Notifications"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#d0bcff] ring-2 ring-[#0f0f13]" />
              </button>
              <a
                href="/organizer/events/new"
                className="px-4 py-1.5 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-1.5 hover:bg-[#a078ff] transition-all shadow-[0_0_16px_rgba(208,188,255,0.25)]"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                <span>Create Event</span>
              </a>
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