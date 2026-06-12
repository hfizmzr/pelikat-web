'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { OrganizerSidebar, OrganizerMobileNav } from '@/components/layout/organizer-sidebar'
import { UserMenu } from '@/components/auth/user-menu'
import { ThemeToggle } from '@/components/theme-toggle'
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
    !pathname.startsWith('/organizer/payment')

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

      // Redirect to payment page if subscription has never been set up
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
    <div className="flex min-h-screen bg-background">
      {showSidebar && (
        <div className="hidden lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col">
          <OrganizerSidebar />
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        {showSidebar && (
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card px-6">
            <OrganizerMobileNav />
            <div className="flex items-center gap-4 ml-auto">
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
        )}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  )
}