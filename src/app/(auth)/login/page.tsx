'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const supabase = createClient()

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`
      }
    })
  }

  return (
    <div className="flex bg-slate-50 items-center justify-center min-h-screen">
      <div className="p-8 bg-white border rounded-lg shadow-sm w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-center">Pelikat Running</h1>
        <p className="text-sm text-slate-500 text-center">
          Sign in to access your dashboard and event details.
        </p>
        <Button onClick={handleLogin} className="w-full">
          Sign in with Google
        </Button>
      </div>
    </div>
  )
}
