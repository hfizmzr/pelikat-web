'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { Loader2 } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
  allowedRoles?: ('admin' | 'organizer' | 'runner')[]
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { user, role, loading } = useAuth()
  const router = useRouter()

  const isAuthorized = !loading && !!user && (!allowedRoles || !role || allowedRoles.includes(role))

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.push('/login')
      return
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
      if (role === 'admin') {
        router.push('/admin')
      } else if (role === 'organizer') {
        router.push('/organizer')
      } else {
        router.push('/runner')
      }
      return
    }
  }, [user, role, loading, router, allowedRoles])

  if (loading || !isAuthorized) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}