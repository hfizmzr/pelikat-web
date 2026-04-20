'use client'

import { RunnerSidebar, RunnerMobileNav } from '@/components/layout/runner-sidebar'
import { UserMenu } from '@/components/auth/user-menu'

export default function RunnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <RunnerSidebar />
      </div>
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card px-6">
          <RunnerMobileNav />
          <div className="flex items-center gap-4 ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}