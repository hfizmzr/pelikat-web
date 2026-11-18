'use client'

import type { LucideIcon } from "lucide-react"
import { Flag, Landmark, LayoutDashboard, LogOut, Menu, QrCode, Settings2, Shirt, Smartphone, TrendingUp, Users } from "lucide-react"
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand-mark'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

const navSections = [
  {
    label: 'Race',
    items: [
      { title: 'Overview', href: '/organizer', icon: LayoutDashboard, exact: true },
      { title: 'Events', href: '/organizer/events', icon: Flag },
      { title: 'Runners', href: '/organizer/runners', icon: Users },
      { title: 'Kit collection', href: '/organizer/repc', icon: QrCode },
      { title: 'Merch', href: '/organizer/merch', icon: Shirt },
      { title: 'Mobile console', href: '/organizer/mobile', icon: Smartphone },
    ],
  },
  {
    label: 'Organization',
    items: [
      { title: 'Analytics', href: '/organizer/analytics', icon: TrendingUp },
      { title: 'Finance', href: '/organizer/financial', icon: Landmark },
      { title: 'Settings', href: '/organizer/settings', icon: Settings2 },
    ],
  },
]

function NavItem({
  item,
  pathname,
}: {
  item: { title: string; href: string; icon: LucideIcon; exact?: boolean }
  pathname: string
}) {
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors',
        isActive
          ? 'bg-accent text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      )}
    >
      <item.icon className={cn('size-[18px] shrink-0', isActive && 'text-primary')} strokeWidth={1.75} />
      <span className="truncate">{item.title}</span>
    </Link>
  )
}

function SidebarContent({ pathname }: { pathname: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [orgName, setOrgName] = useState<string>('My organization')
  const [userName, setUserName] = useState<string>('Organizer')

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.full_name) setUserName(profile.full_name)

      const orgId = user.app_metadata?.organizer_id
      if (orgId) {
        const { data: org } = await supabase
          .from('organizers')
          .select('name')
          .eq('id', orgId)
          .maybeSingle()
        if (org?.name) setOrgName(org.name)
      }
    }
    fetchData()
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login?switchAccount=1')
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <BrandMark />
      </div>

      <div className="mx-3 mb-2 shrink-0 rounded-lg border border-border px-3 py-2.5">
        <p className="truncate text-[14px] font-medium text-foreground">{orgName}</p>
        <p className="text-[12px] text-muted-foreground">Organizer</p>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-4" aria-label="Organizer">
        {navSections.map((section) => (
          <div key={section.label} className="mt-5 first:mt-2">
            <p className="mb-2 px-2.5 text-[12px] text-muted-foreground">{section.label}</p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItem key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-medium text-foreground">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate text-[13px] text-foreground">{userName}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

export function OrganizerSidebar() {
  const pathname = usePathname()
  return <SidebarContent pathname={pathname} />
}

export function OrganizerMobileNav() {
  const pathname = usePathname()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden text-foreground">
          <Menu className="size-5" strokeWidth={1.75} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-sidebar border-r border-border">
        <SidebarContent pathname={pathname} />
      </SheetContent>
    </Sheet>
  )
}

