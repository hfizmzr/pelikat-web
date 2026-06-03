'use client'

import { use, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Copy, Clock, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { generateConsentCode } from '@/components/events/actions'

export default function BibConsentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const supabase = createClient()
  const [registration, setRegistration] = useState<{
    id: string
    bib_number: string
    events: { name: string; event_date: string; location?: string }
    race_categories: { name: string; price: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('runner_profiles')
        .select('id, full_name')
        .eq('user_id', user?.id)
        .single()

      const { data: reg } = await supabase
        .from('registrations')
        .select('*, events(*), race_categories(*)')
        .eq('event_id', id)
        .eq('runner_id', profile?.id)
        .single()

      setRegistration(reg)
      setLoading(false)
    })()
  }, [id, supabase])

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)

    try {
      if (!registration) throw new Error('Registration not found')
      const data = await generateConsentCode(registration.id)

      setCode(data.code)
      setExpiresAt(data.expires_at)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate consent code')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (code) {
      await navigator.clipboard.writeText(code)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/runner/events/${id}/bib`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proxy Collection</h1>
          <p className="text-muted-foreground">Generate a code for someone else to collect your race pack</p>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Generate Consent Code</CardTitle>
          <CardDescription>
            Share this code with the person collecting your race pack on your behalf.
            The code is valid for 24 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {code ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-secondary p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">Your Consent Code</p>
                <p className="text-4xl font-mono font-bold tracking-widest">{code}</p>
                {expiresAt && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires: {new Date(expiresAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Code
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setCode(null); setExpiresAt(null) }}
                >
                  Generate New
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                Give this code to the person collecting on your behalf.
                They&apos;ll need to show it along with your name at the race pack collection point.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event</span>
                  <span>{registration?.events?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">BIB</span>
                  <span className="font-mono">{registration?.bib_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span>{registration?.race_categories?.name}</span>
                </div>
              </div>

              <Button className="w-full" onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {generating ? 'Generating...' : 'Generate Consent Code'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
