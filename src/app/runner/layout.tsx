'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { RunnerSidebar, RunnerMobileNav } from '@/components/layout/runner-sidebar'
import { UserMenu } from '@/components/auth/user-menu'
import { ThemeToggle } from '@/components/theme-toggle'

export default function RunnerLayout({
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
      
      if (role !== 'runner') {
        router.push('/')
      }
    }
    checkRole()
  }, [router, supabase])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <RunnerSidebar />
      </div>
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card px-6">
          <RunnerMobileNav />
          <div className="flex items-center gap-4 ml-auto">
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}