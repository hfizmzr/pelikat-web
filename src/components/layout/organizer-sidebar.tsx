'use client'

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
      { title: 'Overview', href: '/organizer', icon: 'dashboard', exact: true },
      { title: 'Race Events & Waves', href: '/organizer/events', icon: 'flag' },
      { title: 'Runner Directory & BIBs', href: '/organizer/runners', icon: 'badge' },
      { title: 'REPC Station', href: '/organizer/repc', icon: 'qr_code_scanner', badge: 'Live' },
      { title: 'Merch & Kit Inventory', href: '/organizer/merch', icon: 'apparel' },
    ],
  },
  {
    label: 'Operations & Config',
    items: [
      { title: 'Telemetry & Analytics', href: '/organizer/analytics', icon: 'insights' },
      { title: 'Financial Rails', href: '/organizer/financial', icon: 'account_balance' },
      { title: 'Settings & Webhooks', href: '/organizer/settings', icon: 'settings_suggest' },
    ],
  },
]

function NavItem({
  item,
  pathname,
}: {
  item: { title: string; href: string; icon: string; badge?: string; exact?: boolean }
  pathname: string
}) {
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center justify-between px-3 py-2 rounded-lg transition-all text-[12px] leading-[16px] tracking-[0.02em] font-medium',
        isActive
          ? 'bg-[#a078ff] text-[#340080] font-semibold shadow-[0_0_16px_rgba(160,120,255,0.3)]'
          : 'text-[#cbc3d7] hover:text-[#e5e1e4] hover:bg-[#1c1b1d]'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'material-symbols-outlined text-[20px]',
            isActive ? 'text-[#340080]' : 'text-[#958ea0]'
          )}
        >
          {item.icon}
        </span>
        <span>{item.title}</span>
      </div>
      {item.badge && (
        <span className="px-1.5 py-0.5 rounded-full bg-[#4edea3]/15 text-[#4edea3] text-[10px] font-semibold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />
          {item.badge}
        </span>
      )}
      {isActive && !item.badge && (
        <span className="w-2 h-2 rounded-full bg-[#340080]" />
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
    <div className="flex flex-col h-full w-64 bg-[#0e0e10] border-r border-[#23232b]">
      {/* Logo header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#23232b] bg-[#0f0f13] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#d0bcff]/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#d0bcff] text-[16px]">flag</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[18px] leading-[24px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">
              Pelikat
            </span>
            <span className="text-[10px] text-[#958ea0] font-semibold tracking-wider uppercase mt-0.5">
              Organizer Hub
            </span>
          </div>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-[#4cd7f6]/15 text-[#4cd7f6] text-[10px] font-semibold border border-[#4cd7f6]/20">
          B2B
        </span>
      </div>

      {/* Org switcher */}
      <div className="p-2 border-b border-[#23232b] shrink-0">
        <button className="w-full flex items-center justify-between p-2 rounded-lg bg-[#1c1b1d] hover:bg-[#201f22] transition-colors text-left group">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#2a2a2c] flex items-center justify-center text-[#d0bcff] shrink-0">
              <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] leading-[16px] font-semibold text-[#e5e1e4] truncate">{orgName}</span>
              <span className="text-[11px] text-[#4cd7f6] font-medium">Organizer Portal</span>
            </div>
          </div>
          <span className="material-symbols-outlined text-[#958ea0] group-hover:text-[#e5e1e4] transition-colors text-[18px]">
            unfold_more
          </span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-2 py-1 text-[10px] uppercase font-bold text-[#958ea0] tracking-wider mt-2 first:mt-0">
              {section.label}
            </div>
            {section.items.map((item) => (
              <NavItem key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom user section */}
      <div className="p-2 border-t border-[#23232b] flex flex-col gap-2 bg-[#0f0f13]/80 shrink-0">
        <button
          onClick={() => router.push('/organizer/events/new')}
          className="w-full py-2 px-3 bg-[#4edea3]/20 text-[#4edea3] hover:bg-[#4edea3]/30 text-[12px] leading-[16px] font-medium rounded-lg flex items-center justify-center gap-2 transition-colors border border-[#4edea3]/20 shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          <span>Create Event</span>
        </button>
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#1c1b1d] text-[11px]">
          <span className="flex items-center gap-1.5 text-[#4edea3] font-medium">
            <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
            Platform Online
          </span>
          <span className="text-[#958ea0] font-mono text-[10px]">Hub</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-full bg-[#d0bcff]/20 flex items-center justify-center text-[#d0bcff] text-[14px] font-bold ring-2 ring-[#d0bcff]/40">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4edea3] ring-2 ring-[#0e0e10]" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold text-[#e5e1e4] truncate">{userName}</span>
              <span className="text-[10px] text-[#d0bcff] truncate font-medium">Race Director</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-[#958ea0] hover:text-[#e5e1e4] hover:bg-[#2a2a2c] rounded transition-colors"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
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
        <Button variant="ghost" size="icon" className="lg:hidden text-[#e5e1e4]">
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-[#0e0e10] border-r border-[#23232b]">
        <SidebarContent pathname={pathname} />
      </SheetContent>
    </Sheet>
  )
}

export function getOrganizerEventNavItems(eventId: string) {
  return [
    { title: 'Overview', href: `/organizer/events/${eventId}`, icon: 'dashboard', exact: true },
    { title: 'Categories & Waves', href: `/organizer/events/${eventId}/categories`, icon: 'flag' },
    { title: 'Registrations', href: `/organizer/events/${eventId}/registrations`, icon: 'badge' },
    { title: 'REPC Station', href: `/organizer/events/${eventId}/repc`, icon: 'qr_code_scanner' },
    { title: 'Check-in', href: `/organizer/events/${eventId}/checkin`, icon: 'fact_check' },
    { title: 'Photos', href: `/organizer/events/${eventId}/photos`, icon: 'photo_library' },
    { title: 'Leaderboard', href: `/organizer/events/${eventId}/leaderboard`, icon: 'emoji_events' },
  ]
}
