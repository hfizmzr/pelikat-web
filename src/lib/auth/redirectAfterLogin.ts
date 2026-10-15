'use client'

import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { getUserRole } from '@/lib/auth/requireRole'

export async function redirectAfterLogin(
  user: User,
  router: ReturnType<typeof useRouter>,
  supabase: ReturnType<typeof createClient>
) {
  const role = getUserRole(user)

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
