'use client'

import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export async function redirectAfterLogin(
  user: User,
  router: ReturnType<typeof useRouter>,
  supabase: ReturnType<typeof createClient>
) {
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
      provider: user.app_metadata?.provider || 'email',
      role: user.app_metadata?.role || null,
    },
  })

  if (role === 'admin') {
    router.push('/admin')
  } else if (role === 'organizer') {
    // Check if organizer needs to complete payment first
    const { data: org } = await supabase
      .from('organizers')
      .select('sub_expires_at')
      .eq('contact_email', user.email)
      .maybeSingle()

    if (org && !org.sub_expires_at) {
      router.push('/organizer/payment')
    } else {
      router.push('/organizer')
    }
  } else if (role === 'expired') {
    router.push('/organizer/subscription-expired')
  } else {
    router.push('/runner')
  }
}
