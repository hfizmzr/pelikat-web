'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  LayoutDashboard,
  Calendar,
  User,
  Trophy,
  Shirt,
  MapPin,
  Award,
  Menu,
  LogOut,
  Flag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const runnerNavItems = [
  {
    title: 'Dashboard',
    href: '/runner',
    icon: LayoutDashboard,
  },
  {
    title: 'Events',
    href: '/runner/events',
    icon: Calendar,
  },
  {
    title: 'Run Log',
    href: '/runner/run-log',
    icon: MapPin,
  },
  {
    title: 'Badges',
    href: '/runner/badges',
    icon: Award,
  },
  {
    title: 'Leaderboard',
    href: '/runner/leaderboard',
    icon: Trophy,
  },
  {
    title: 'Merch',
    href: '/runner/merch',
    icon: Shirt,
  },
  {
    title: 'Settings',
    href: '/runner/profile',
    icon: User,
  },
]

export function RunnerSidebar() {
  const pathname = usePathname()
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login?switchAccount=1')
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Flag className="mr-2 h-6 w-6 text-primary" />
        <span className="text-lg font-bold">Pelikat</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {runnerNavItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  )
}

export function RunnerMobileNav() {
  const pathname = usePathname()
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login?switchAccount=1')
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center border-b px-6">
            <Flag className="mr-2 h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Pelikat</span>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {runnerNavItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              )
            })}
          </nav>

          <div className="border-t p-4">
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
