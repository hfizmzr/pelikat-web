'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CallbackPage() {
  const router = useRouter()
  const params = useSearchParams()
  const code = params.get('code')
  const supabase = createClient()

  useEffect(() => {
    if (!code) {
      router.push('/login?error=no-code')
      return
    }

    const process = async () => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error || !data?.user) {
        router.push('/login?error=auth-failed')
        return
      }

      const user = data.user
      const role =
        user.app_metadata?.role ||
        user.user_metadata?.role ||
        'runner'

      // Log the login event
      await supabase.from('audit_log').insert({
        actor_id: user.id,
        actor_email: user.email,
        actor_name: (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || null,
        action: 'user_login',
        metadata: {
          provider: user.app_metadata?.provider || null,
          role: user.app_metadata?.role || null,
        },
      })

      if (role === 'admin') {
        router.push('/admin')
      } else if (role === 'organizer') {
        router.push('/organizer')
      } else if (role === 'expired') {
        router.push('/organizer/subscription-expired')
      } else {
        router.push('/runner')
      }
    }

    process()
  }, [code, router, supabase])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Processing login...</p>
      </div>
    </div>
  )
}
