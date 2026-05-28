'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Mail, LogOut, Loader2 } from 'lucide-react'

interface Organizer {
  id: string
  name: string
  slug: string
  sub_expires_at: string | null
  contact_email: string | null
}

export default function SubscriptionExpiredPage() {
  const router = useRouter()
  const supabase = createClient()
  const [organizer, setOrganizer] = useState<Organizer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrganizer() {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user?.app_metadata?.organizer_id) {
        router.push('/')
        return
      }

      const { data } = await supabase
        .from('organizers')
        .select('id, name, slug, sub_expires_at, contact_email')
        .eq('id', user.app_metadata.organizer_id)
        .single()

      if (data) {
        setOrganizer(data)
      }
      setLoading(false)
    }

    loadOrganizer()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login?switchAccount=1')
  }

  const expiryDate = organizer?.sub_expires_at
    ? new Date(organizer.sub_expires_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'Unknown'

  const mailtoLink = organizer
    ? `mailto:admin@pelikat.com?subject=${encodeURIComponent(`Subscription Renewal - ${organizer.name}`)}&body=${encodeURIComponent(`Hello,\n\nOur subscription for "${organizer.name}" (slug: ${organizer.slug}) has expired on ${expiryDate}.\n\nWe would like to renew our access to the platform.\n\nContact email: ${organizer.contact_email || 'N/A'}\n\nThank you.`)}`
    : 'mailto:admin@pelikat.com?subject=Subscription Renewal'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Subscription Expired</CardTitle>
          <CardDescription>
            Your workspace access has been suspended
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {organizer && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Workspace</span>
                <span className="font-medium">{organizer.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Slug</span>
                <span className="font-medium">{organizer.slug}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expired on</span>
                <span className="font-medium text-destructive">{expiryDate}</span>
              </div>
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              To renew your subscription, please contact the platform admin.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild size="lg">
              <a href={mailtoLink}>
                <Mail className="mr-2 h-4 w-4" />
                Email Admin
              </a>
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
