import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'

interface UseAuthResult {
  user: User | null
  profile: RunnerProfile | OrganizerProfile | null
  role: 'admin' | 'organizer' | 'runner' | null
  loading: boolean
}

interface RunnerProfile {
  id: string
  user_id: string
  full_name: string | null
  phone: string | null
}

interface OrganizerProfile {
  id: string
  name: string
  slug: string
}

export function useAuth(): UseAuthResult {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<RunnerProfile | OrganizerProfile | null>(null)
  const [role, setRole] = useState<'admin' | 'organizer' | 'runner' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setUser(user)
        const userRole = user.app_metadata?.role as string | undefined
        setRole(userRole as 'admin' | 'organizer' | 'runner' | null)

        if (userRole === 'organizer') {
          const { data: organizer } = await supabase
            .from('organizers')
            .select('id, name, slug')
            .eq('id', user.app_metadata?.organizer_id)
            .single()

          if (organizer) {
            setProfile(organizer)
          }
        } else {
          const { data: runnerProfile } = await supabase
            .from('runner_profiles')
            .select('id, user_id, full_name, phone')
            .eq('user_id', user.id)
            .single()

          setProfile(runnerProfile)
        }
      } else {
        setUser(null)
        setProfile(null)
        setRole(null)
      }

      setLoading(false)
    }

    getUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        setProfile(null)
        setRole(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, profile, role, loading }
}

export function useUser() {
  const { user, loading } = useAuth()
  return { user, loading }
}

export function useRole() {
  const { role, loading } = useAuth()
  return { role, loading }
}