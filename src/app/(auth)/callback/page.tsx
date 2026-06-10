'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { redirectAfterLogin } from '@/lib/auth/redirectAfterLogin'

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

      await redirectAfterLogin(data.user, router, supabase)
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
