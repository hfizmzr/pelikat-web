'use client'

import { Store } from "lucide-react"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { AdminSidebar, AdminMobileNav } from '@/components/layout/admin-sidebar'
import { Toaster } from '@/components/ui/sonner'
import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const supabase = createClient()
  const [clock, setClock] = useState('')

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

  // Live UTC clock
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(
        now.toISOString().slice(0, 10) +
          ' ' +
          now.toISOString().slice(11, 19) +
          ' UTC'
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex min-h-dvh bg-background dark">
      {/* ── Sticky Desktop Sidebar ─────────────────────────────── */}
      <div className="hidden lg:sticky lg:top-0 lg:h-dvh lg:flex lg:flex-col shrink-0">
        <AdminSidebar />
      </div>

      {/* ── Main Column ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* ── Control Plane Header Strip ──────────────────────── */}
        <header className="sticky top-0 z-40 h-16 bg-card/80 backdrop-blur-md border-b border-muted flex items-center justify-between px-6 gap-4 shrink-0">
          {/* Left: Mobile toggle + breadcrumbs */}
          <div className="flex items-center gap-3">
            <AdminMobileNav />

            {/* Platform indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-bold tracking-widest uppercase font-inter text-primary">
                Platform Admin
              </span>
            </div>

          </div>

          {/* Right: Clock + CTA */}
          <div className="flex items-center gap-3">
            {/* Live clock */}
            <span className="hidden lg:inline-block text-[11px] text-border font-mono font-inter">
              {clock}
            </span>

            {/* Add Tenant Organizer CTA */}
            <Link
              href="/admin/organizers"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary text-primary-foreground hover:text-white text-[13px] font-semibold font-inter transition-all shadow-md"
            >
              <Store className="size-[18px]" />
              <span className="hidden sm:inline">+ Add Tenant Organizer</span>
            </Link>
          </div>
        </header>

        {/* ── Page Content ────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-background p-6 scrollbar-none">
          {children}
        </main>
      </div>

      <Toaster richColors position="bottom-right" />
    </div>
  )
}