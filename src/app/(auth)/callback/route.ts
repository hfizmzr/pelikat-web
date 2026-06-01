import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no-code`)
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data?.user) {
    return NextResponse.redirect(`${origin}/login?error=auth-failed`)
  }

  const user = data.user

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

  const role =
    user.app_metadata?.role ||
    user.user_metadata?.role ||
    'runner'

  // Direct redirect based on role
  if (role === 'admin') {
    return NextResponse.redirect(`${origin}/admin`)
  }

  if (role === 'organizer') {
    return NextResponse.redirect(`${origin}/organizer`)
  }

  if (role === 'expired') {
    return NextResponse.redirect(`${origin}/organizer/subscription-expired`)
  }

  return NextResponse.redirect(`${origin}/runner`)
}