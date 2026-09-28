'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

// ─── Nav structure matching new design ──────────────────────────────────────
interface NavItem {
  title: string
  href: string
  icon: string // Material Symbol name
  badge?: string
  pulse?: boolean
}

const coreFleetNav: NavItem[] = [
  { title: 'Platform Overview', href: '/admin', icon: 'grid_view' },
  { title: 'Tenant Organizers', href: '/admin/organizers', icon: 'apartment' },
  { title: 'Nodes & Telemetry', href: '/admin/nodes', icon: 'monitoring', pulse: true },
  { title: 'Global Registrations', href: '/admin/registrations', icon: 'groups' },
]

const governanceNav: NavItem[] = [
  { title: 'Audit & Compliance', href: '/admin/audit-logs', icon: 'verified_user' },
  { title: 'Billing & Escrow', href: '/admin/billing', icon: 'account_balance_wallet' },
  { title: 'Feature Flags', href: '/admin/settings', icon: 'toggle_on' },
  { title: 'Security & IAM', href: '/admin/security', icon: 'lock' },
]

// ─── Sidebar content (shared between desktop & mobile Sheet) ─────────────────
function SidebarContent({
  pathname,
  user,
  onLogout,
  activeOrgCount,
}: {
  pathname: string
  user: User | null
  onLogout: () => void
  activeOrgCount: number
}) {
  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <div className="flex flex-col h-full bg-[#0e0e10] border-r border-[#23232b] select-none scrollbar-none overflow-y-auto">
      {/* ── Logo / Brand ───────────────────────────────────── */}
      <div className="h-16 px-4 border-b border-[#23232b] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#a078ff]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px] text-[#d0bcff]">sprint</span>
          </div>
          <span className="font-jakarta font-bold text-[17px] tracking-tight text-[#e5e1e4]">Pelikat</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-[#93000a]/20 text-[#ffb4ab] border border-[#ffb4ab]/20 text-[10px] font-bold tracking-wider uppercase font-inter">
          ROOT
        </span>
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="flex-1 p-2 flex flex-col gap-1 pt-3">
        {/* Core Fleet section */}
        <span className="px-2 pt-1 pb-1 text-[10px] uppercase font-bold tracking-widest text-[#958ea0] font-inter">
          Core Fleet
        </span>
        {coreFleetNav.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-lg font-inter transition-all text-[13px] font-medium',
                active
                  ? 'bg-[#a078ff] text-[#340080] shadow-[0_0_16px_rgba(160,120,255,0.3)]'
                  : 'text-[#cbc3d7] hover:text-[#e5e1e4] hover:bg-[#201f22]'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'material-symbols-outlined text-[20px]',
                    active ? 'text-[#340080]' : item.pulse ? 'text-[#4edea3]' : 'text-[#958ea0]'
                  )}
                >
                  {item.icon}
                </span>
                <span>{item.title}</span>
              </div>
              {/* Live count badge for Tenant Organizers */}
              {item.href === '/admin/organizers' && !active && activeOrgCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#d0bcff]/20 text-[#d0bcff] text-[10px] font-bold border border-[#d0bcff]/20 font-mono">
                  {activeOrgCount}
                </span>
              )}
              {item.pulse && !active && (
                <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
              )}
            </Link>
          )
        })}

        {/* Governance section */}
        <span className="px-2 pt-3 pb-1 text-[10px] uppercase font-bold tracking-widest text-[#958ea0] font-inter">
          Governance
        </span>
        {governanceNav.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3 py-2 rounded-lg font-inter transition-all text-[13px] font-medium',
                active
                  ? 'bg-[#a078ff] text-[#340080] shadow-[0_0_16px_rgba(160,120,255,0.3)]'
                  : 'text-[#cbc3d7] hover:text-[#e5e1e4] hover:bg-[#201f22]'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'material-symbols-outlined text-[20px]',
                    active ? 'text-[#340080]' : 'text-[#958ea0]'
                  )}
                >
                  {item.icon}
                </span>
                <span>{item.title}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* ── Footer / User Profile ────────────────────────────── */}
      <div className="p-2 border-t border-[#23232b] flex flex-col gap-2 mt-auto shrink-0">
        {/* Failsafe Armed indicator */}
        <div className="p-2 rounded-lg bg-[#93000a]/10 border border-[#ffb4ab]/20 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[#ffb4ab]">
            <span className="material-symbols-outlined text-[16px]">warning</span>
            <span className="text-[10px] font-mono font-bold uppercase font-inter">Failsafe Armed</span>
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-pulse" />
        </div>

        {/* User card */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-[#1c1b1d] border border-[#494454]/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#a078ff]/20 flex items-center justify-center ring-1 ring-[#a078ff]/40 text-[#d0bcff] font-bold text-[13px] font-jakarta">
                {user?.email?.[0]?.toUpperCase() ?? 'A'}
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[#4edea3] ring-1 ring-[#1c1b1d]" />
            </div>
            <div className="flex flex-col text-left leading-tight min-w-0">
              <span className="text-[11px] text-[#e5e1e4] font-semibold font-inter truncate max-w-[110px]">
                {user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Super Admin'}
              </span>
              <span className="text-[10px] text-[#d0bcff] font-mono truncate max-w-[110px]">
                ROOT / Super-Admin
              </span>
            </div>
          </div>
          <button
            className="p-1 text-[#958ea0] hover:text-[#ffb4ab] hover:bg-[#201f22] rounded transition-colors"
            title="Log out"
            onClick={onLogout}
          >
            <span className="material-symbols-outlined text-[18px]">lock</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────
export function AdminSidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [activeOrgCount, setActiveOrgCount] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    supabase
      .from('organizers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .then(({ count }) => setActiveOrgCount(count ?? 0))
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login?switchAccount=1')
  }

  return (
    <div className="flex h-full w-64 flex-col">
      <SidebarContent pathname={pathname} user={user} onLogout={handleLogout} activeOrgCount={activeOrgCount} />
    </div>
  )
}

// ─── Mobile Nav (Sheet) ───────────────────────────────────────────────────────
export function AdminMobileNav() {
  const pathname = usePathname()
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [activeOrgCount, setActiveOrgCount] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    supabase
      .from('organizers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .then(({ count }) => setActiveOrgCount(count ?? 0))
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login?switchAccount=1')
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="p-2 rounded-lg text-[#cbc3d7] hover:text-[#e5e1e4] hover:bg-[#201f22] transition-colors lg:hidden">
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 border-r border-[#23232b] bg-[#0e0e10]">
        <SidebarContent pathname={pathname} user={user} onLogout={handleLogout} activeOrgCount={activeOrgCount} />
      </SheetContent>
    </Sheet>
  )
}
