'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getUserRole } from '@/lib/auth/requireRole'
import { AdminSidebar, AdminMobileNav } from '@/components/layout/admin-sidebar'
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
    <div className="flex min-h-screen bg-[#131315] dark">
      {/* ── Sticky Desktop Sidebar ─────────────────────────────── */}
      <div className="hidden lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col shrink-0">
        <AdminSidebar />
      </div>

      {/* ── Main Column ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* ── Control Plane Header Strip ──────────────────────── */}
        <header className="sticky top-0 z-40 h-16 bg-[#1c1b1d]/80 backdrop-blur-md border-b border-[#23232b] flex items-center justify-between px-6 gap-4 shrink-0">
          {/* Left: Mobile toggle + breadcrumbs */}
          <div className="flex items-center gap-3">
            <AdminMobileNav />

            {/* Platform indicator */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d0bcff]/10 border border-[#d0bcff]/20">
              <span className="w-2 h-2 rounded-full bg-[#d0bcff] animate-pulse" />
              <span className="text-[10px] font-bold tracking-widest uppercase font-inter text-[#d0bcff]">
                Platform Control Plane
              </span>
            </div>

            {/* Fleet info */}
            <div className="hidden lg:flex items-center gap-2 text-[#cbc3d7] text-[12px] font-inter">
              <span className="material-symbols-outlined text-[15px] text-[#958ea0]">dns</span>
              <span>Fleet AWS ap-southeast-1</span>
              <span className="text-[#494454]">•</span>
              <span className="text-[#4edea3] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-ping inline-block" />
                Multi-Tenant Strict
              </span>
            </div>
          </div>

          {/* Right: Clock + CTA */}
          <div className="flex items-center gap-3">
            {/* Live clock */}
            <span className="hidden lg:inline-block text-[11px] text-[#494454] font-mono font-inter">
              NODE_CLOCK: {clock}
            </span>

            {/* Add Tenant Organizer CTA */}
            <Link
              href="/admin/organizers"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#d0bcff] hover:bg-[#6d3bd7] text-[#3c0091] hover:text-white text-[13px] font-semibold font-inter transition-all shadow-md glow-primary"
            >
              <span className="material-symbols-outlined text-[18px]">add_business</span>
              <span className="hidden sm:inline">+ Add Tenant Organizer</span>
            </Link>
          </div>
        </header>

        {/* ── Page Content ────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-[#131315] p-6 scrollbar-none">
          {children}
        </main>
      </div>
    </div>
  )
}