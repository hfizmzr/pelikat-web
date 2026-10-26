'use client'

import type { LucideIcon } from "lucide-react"
import { Building2, ChartLine, LayoutGrid, Lock, Menu, ShieldCheck, ToggleRight, TriangleAlert, Users, Wallet, Zap } from "lucide-react"
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
  icon: LucideIcon
  badge?: string
  pulse?: boolean
}

const coreFleetNav: NavItem[] = [
  { title: 'Platform Overview', href: '/admin', icon: LayoutGrid },
  { title: 'Tenant Organizers', href: '/admin/organizers', icon: Building2 },
  { title: 'Nodes & Telemetry', href: '/admin/nodes', icon: ChartLine, pulse: true },
  { title: 'Global Registrations', href: '/admin/registrations', icon: Users },
]

const governanceNav: NavItem[] = [
  { title: 'Audit & Compliance', href: '/admin/audit-logs', icon: ShieldCheck },
  { title: 'Billing & Escrow', href: '/admin/billing', icon: Wallet },
  { title: 'Feature Flags', href: '/admin/settings', icon: ToggleRight },
  { title: 'Admin Users', href: '/admin/users', icon: Users },
  { title: 'Security & IAM', href: '/admin/security', icon: Lock },
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
    <div className="flex flex-col h-full bg-background border-r border-muted select-none scrollbar-none overflow-y-auto">
      {/* ── Logo / Brand ───────────────────────────────────── */}
      <div className="h-16 px-4 border-b border-muted flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="size-[18px] text-primary" />
          </div>
          <span className="font-jakarta font-bold text-[17px] tracking-tight text-foreground">Pelikat</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-red-800/20 text-red-500 dark:text-red-300 border border-red-500/30 dark:border-red-300/20 text-[10px] font-bold tracking-wider uppercase font-inter">
          ROOT
        </span>
      </div>

      {/* ── Navigation ─────────────────────────────────────── */}
      <nav className="flex-1 p-2 flex flex-col gap-1 pt-3">
        {/* Core Fleet section */}
        <span className="px-2 pt-1 pb-1 text-[10px] uppercase font-bold tracking-widest text-muted-foreground font-inter">
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
                  ? 'bg-primary text-primary-foreground '
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex shrink-0',
                    active ? 'text-primary-foreground' : item.pulse ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="size-[20px]" />
                </span>
                <span>{item.title}</span>
              </div>
              {/* Live count badge for Tenant Organizers */}
              {item.href === '/admin/organizers' && !active && activeOrgCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold border border-primary/20 font-mono">
                  {activeOrgCount}
                </span>
              )}
              {item.pulse && !active && (
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              )}
            </Link>
          )
        })}

        {/* Governance section */}
        <span className="px-2 pt-3 pb-1 text-[10px] uppercase font-bold tracking-widest text-muted-foreground font-inter">
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
                  ? 'bg-primary text-primary-foreground '
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex shrink-0',
                    active ? 'text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="size-[20px]" />
                </span>
                <span>{item.title}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* ── Footer / User Profile ────────────────────────────── */}
      <div className="p-2 border-t border-muted flex flex-col gap-2 mt-auto shrink-0">
        {/* Failsafe Armed indicator */}
        <div className="p-2 rounded-lg bg-red-800/10 border border-red-500/30 dark:border-red-300/20 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-red-500 dark:text-red-300">
            <TriangleAlert className="size-[16px]" />
            <span className="text-[10px] font-mono font-bold uppercase font-inter">Failsafe Armed</span>
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-300 animate-pulse" />
        </div>

        {/* User card */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-primary/40 text-primary font-bold text-[13px] font-jakarta">
                {user?.email?.[0]?.toUpperCase() ?? 'A'}
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-success ring-1 ring-card" />
            </div>
            <div className="flex flex-col text-left leading-tight min-w-0">
              <span className="text-[11px] text-foreground font-semibold font-inter truncate max-w-[110px]">
                {user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Super Admin'}
              </span>
              <span className="text-[10px] text-primary font-mono truncate max-w-[110px]">
                ROOT / Super-Admin
              </span>
            </div>
          </div>
          <button
            className="p-1 text-muted-foreground hover:text-red-500 dark:text-red-300 hover:bg-card rounded transition-colors"
            title="Log out"
            onClick={onLogout}
          >
            <Lock className="size-[18px]" />
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
        <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors lg:hidden">
          <Menu className="size-[22px]" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 border-r border-muted bg-background">
        <SidebarContent pathname={pathname} user={user} onLogout={handleLogout} activeOrgCount={activeOrgCount} />
      </SheetContent>
    </Sheet>
  )
}
