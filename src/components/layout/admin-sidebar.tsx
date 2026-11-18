'use client'

import type { LucideIcon } from "lucide-react"
import { Building2, ChartLine, LayoutGrid, Lock, LogOut, Menu, ShieldCheck, ToggleRight, UserCog, Users, Wallet } from "lucide-react"
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BrandLink } from '@/components/brand-mark'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

/** Shared sidebar nav data: signed-in user + active organizer count + logout. */
function useAdminNavData() {
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

  return { user, activeOrgCount, handleLogout }
}

// ─── Nav structure matching new design ──────────────────────────────────────
interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  badge?: string
  pulse?: boolean
}

const platformNav: NavItem[] = [
  { title: 'Overview', href: '/admin', icon: LayoutGrid },
  { title: 'Organizers', href: '/admin/organizers', icon: Building2 },
  { title: 'Registrations', href: '/admin/registrations', icon: Users },
  { title: 'System health', href: '/admin/nodes', icon: ChartLine },
]

const governanceNav: NavItem[] = [
  { title: 'Audit log', href: '/admin/audit-logs', icon: ShieldCheck },
  { title: 'Billing', href: '/admin/billing', icon: Wallet },
  { title: 'Settings', href: '/admin/settings', icon: ToggleRight },
  { title: 'Admin users', href: '/admin/users', icon: UserCog },
  { title: 'Security', href: '/admin/security', icon: Lock },
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

  const NavRow = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href)
    return (
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors',
          active
            ? 'bg-accent text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
        )}
      >
        <item.icon className={cn('size-[18px] shrink-0', active && 'text-primary')} strokeWidth={1.75} />
        <span className="flex-1 truncate">{item.title}</span>
        {item.href === '/admin/organizers' && activeOrgCount > 0 && (
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{activeOrgCount}</span>
        )}
      </Link>
    )
  }

  return (
    <div className="flex h-full w-64 flex-col overflow-y-auto border-r border-border bg-sidebar select-none scrollbar-none">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        <BrandLink href="/admin" label="Admin dashboard" />
        <span className="text-[12px] text-muted-foreground">Admin</span>
      </div>

      <nav className="flex flex-1 flex-col px-3 pb-4" aria-label="Admin">
        {[
          { label: 'Platform', items: platformNav },
          { label: 'Governance', items: governanceNav },
        ].map((section) => (
          <div key={section.label} className="mt-5 first:mt-2">
            <p className="mb-2 px-2.5 text-[12px] text-muted-foreground">{section.label}</p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => <NavRow key={item.href} item={item} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-medium text-foreground">
            {user?.email?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] text-foreground">
              {user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Admin'}
            </p>
            <p className="text-[12px] text-muted-foreground">Platform admin</p>
          </div>
        </div>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Sign out"
          aria-label="Sign out"
          onClick={onLogout}
        >
          <LogOut className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────
export function AdminSidebar() {
  const pathname = usePathname()
  const { user, activeOrgCount, handleLogout } = useAdminNavData()

  return (
    <div className="flex h-full w-64 flex-col">
      <SidebarContent pathname={pathname} user={user} onLogout={handleLogout} activeOrgCount={activeOrgCount} />
    </div>
  )
}

// ─── Mobile Nav (Sheet) ───────────────────────────────────────────────────────
export function AdminMobileNav() {
  const pathname = usePathname()
  const { user, activeOrgCount, handleLogout } = useAdminNavData()
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button aria-label="Open menu" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors lg:hidden">
          <Menu className="size-5" strokeWidth={1.75} />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 p-0 border-r border-border bg-sidebar"
        // Close the sheet when any link inside it is followed (nav items, the
        // logo): the layout persists across navigations, so it would stay open.
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('a[href]')) setOpen(false)
        }}
      >
        <SidebarContent pathname={pathname} user={user} onLogout={handleLogout} activeOrgCount={activeOrgCount} />
      </SheetContent>
    </Sheet>
  )
}
