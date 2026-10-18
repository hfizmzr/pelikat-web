'use client'

import type { LucideIcon } from "lucide-react"
import { Badge, Building2, ChevronsUpDown, CirclePlus, ClipboardCheck, Flag, Images, Landmark, LayoutDashboard, LogOut, Menu, QrCode, Settings2, Shirt, Smartphone, TrendingUp, Trophy } from "lucide-react"
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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
    label: 'Event Console',
    items: [
      { title: 'Overview', href: '/organizer', icon: LayoutDashboard, exact: true },
      { title: 'Race Events & Waves', href: '/organizer/events', icon: Flag },
      { title: 'Runner Directory & BIBs', href: '/organizer/runners', icon: Badge },
      { title: 'REPC Station', href: '/organizer/repc', icon: QrCode, badge: 'Live' },
      { title: 'Merch Hub', href: '/organizer/merch', icon: Shirt },
    ],
  },
  {
    label: 'Operations & Config',
    items: [
      { title: 'Mobile Console', href: '/organizer/mobile', icon: Smartphone },
      { title: 'Telemetry & Analytics', href: '/organizer/analytics', icon: TrendingUp },
      { title: 'Financial Rails', href: '/organizer/financial', icon: Landmark },
      { title: 'Settings & Webhooks', href: '/organizer/settings', icon: Settings2 },
    ],
  },
]

function NavItem({
  item,
  pathname,
}: {
  item: { title: string; href: string; icon: LucideIcon; badge?: string; exact?: boolean }
  pathname: string
}) {
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center justify-between px-3 py-2 rounded-lg transition-all text-[12px] leading-[16px] tracking-[0.02em] font-medium',
        isActive
          ? 'bg-primary text-primary-foreground font-semibold '
          : 'text-muted-foreground hover:text-foreground hover:bg-card'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex shrink-0',
            isActive ? 'text-primary-foreground' : 'text-muted-foreground'
          )}
        >
          <item.icon className="size-[20px]" />
        </span>
        <span>{item.title}</span>
      </div>
      {item.badge && (
        <span className="px-1.5 py-0.5 rounded-full bg-success/15 text-success text-[10px] font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          {item.badge}
        </span>
      )}
      {isActive && !item.badge && (
        <span className="w-2 h-2 rounded-full bg-primary-foreground" />
      )}
    </Link>
  )
}

function SidebarContent({ pathname }: { pathname: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [orgName, setOrgName] = useState<string>('My Organization')
  const [userName, setUserName] = useState<string>('Organizer')
  const [, setUserEmail] = useState<string>('')

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email || '')

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
    <div className="flex flex-col h-full w-64 bg-background border-r border-muted">
      {/* Logo header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-muted bg-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Flag className="text-primary size-[16px]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-foreground">
              Pelikat
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase mt-0.5">
              Organizer Hub
            </span>
          </div>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-semibold border border-primary/20">
          B2B
        </span>
      </div>

      {/* Org switcher */}
      <div className="p-2 border-b border-muted shrink-0">
        <button className="w-full flex items-center justify-between p-2 rounded-lg bg-card hover:bg-card transition-colors text-left group">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-primary shrink-0">
              <Building2 className="size-[18px]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] leading-[16px] font-semibold text-foreground truncate">{orgName}</span>
              <span className="text-[11px] text-primary font-medium">Organizer Portal</span>
            </div>
          </div>
          <ChevronsUpDown className="text-muted-foreground group-hover:text-foreground transition-colors size-[18px]" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground tracking-wider mt-2 first:mt-0">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavItem key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom user section */}
      <div className="p-2 border-t border-muted flex flex-col gap-2 bg-border/80 shrink-0">
        <button
          onClick={() => router.push('/organizer/events/new')}
          className="w-full py-2 px-3 bg-success/20 text-success hover:bg-success/30 text-[12px] leading-[16px] font-medium rounded-lg flex items-center justify-center gap-2 transition-colors border border-success/20 shadow-sm"
        >
          <CirclePlus className="size-[18px]" />
          <span>Create Event</span>
        </button>
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-card text-[11px]">
          <span className="flex items-center gap-1.5 text-success font-medium">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Platform Online
          </span>
          <span className="text-muted-foreground font-mono text-[10px]">Hub</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[14px] font-bold ring-2 ring-primary/40">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-background" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold text-foreground truncate">{userName}</span>
              <span className="text-[10px] text-primary truncate font-medium">Race Director</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            title="Sign out"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
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
          <Menu className="size-[20px]" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-background border-r border-muted">
        <SidebarContent pathname={pathname} />
      </SheetContent>
    </Sheet>
  )
}

export function getOrganizerEventNavItems(eventId: string) {
  return [
    { title: 'Overview', href: `/organizer/events/${eventId}`, icon: LayoutDashboard, exact: true },
    { title: 'Categories & Waves', href: `/organizer/events/${eventId}/categories`, icon: Flag },
    { title: 'Registrations', href: `/organizer/events/${eventId}/registrations`, icon: Badge },
    { title: 'REPC Station', href: `/organizer/events/${eventId}/repc`, icon: QrCode },
    { title: 'Check-in', href: `/organizer/events/${eventId}/checkin`, icon: ClipboardCheck },
    { title: 'Photos', href: `/organizer/events/${eventId}/photos`, icon: Images },
    { title: 'Leaderboard', href: `/organizer/events/${eventId}/leaderboard`, icon: Trophy },
  ]
}
