'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { OrganizerSidebar, OrganizerMobileNav } from '@/components/layout/organizer-sidebar'
import { UserMenu } from '@/components/auth/user-menu'
import { Toaster } from '@/components/ui/sonner'

export default function OrganizerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      const role = getUserRole(user)
      
      if (role !== 'organizer') {
        router.push('/')
      }
    }
    checkRole()
  }, [router, supabase])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col">
        <OrganizerSidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card px-6">
          <OrganizerMobileNav />
          <div className="flex items-center gap-4 ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  )
}