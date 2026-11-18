'use client'

import { Plus } from "lucide-react"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { AdminSidebar, AdminMobileNav } from '@/components/layout/admin-sidebar'
import { Toaster } from '@/components/ui/sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const supabase = createClient()

  // Auth guard
  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      const role = getUserRole(user)
      if (role !== 'admin') {
        router.push('/')
      }
    }
    checkRole()
  }, [router, supabase])

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ── Sticky Desktop Sidebar ─────────────────────────────── */}
      <div className="hidden lg:sticky lg:top-0 lg:h-dvh lg:flex lg:flex-col shrink-0">
        <AdminSidebar />
      </div>

      {/* ── Main Column ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* ── Control Plane Header Strip ──────────────────────── */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-md sm:px-6">
          <AdminMobileNav />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/admin/organizers"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" strokeWidth={2} />
              <span className="hidden sm:inline">Add organizer</span>
            </Link>
          </div>
        </header>

        {/* ── Page Content ────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-background px-4 py-8 sm:px-8">
          {children}
        </main>
      </div>

      <Toaster richColors position="bottom-right" />
    </div>
  )
}