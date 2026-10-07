'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, CheckCircle2, Copy, Clock, Loader2, Share2 } from 'lucide-react'
import Link from 'next/link'
import { generateConsentCode } from '@/components/events/actions'

type ConsentCode = {
  id?: string
  code: string
  is_used: boolean
  expires_at: string
  created_at?: string | null
}

function getConsentStatus(consentCode: ConsentCode | null) {
  if (!consentCode) return 'none'
  if (consentCode.is_used) return 'used'
  if (new Date(consentCode.expires_at) <= new Date()) return 'expired'
  return 'active'
}

export default function BibConsentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const supabase = useMemo(() => createClient(), [])
  const [registration, setRegistration] = useState<{
    id: string
    bib_number: string
    events: { name: string; event_date: string; location?: string }
    race_categories: { name: string; price: number }
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [consentCode, setConsentCode] = useState<ConsentCode | null>(null)
  const [copied, setCopied] = useState(false)
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

      if (reg?.id) {
        const { data: latestCode } = await supabase
          .from('repc_consent_codes')
          .select('id, code, is_used, expires_at, created_at')
          .eq('registration_id', reg.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        setConsentCode(latestCode ?? null)
      }

      setLoading(false)
    })()
  }, [id, supabase])

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)

    try {
      if (!registration) throw new Error('Registration not found')
      const data = await generateConsentCode(registration.id)

      setConsentCode({
        code: data.code,
        expires_at: data.expires_at,
        is_used: false,
      })
      setCopied(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate consent code')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (consentCode?.code) {
      await navigator.clipboard.writeText(consentCode.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleShare = async () => {
    if (!consentCode?.code || !registration) return

    const text = `Proxy collection code ${consentCode.code} for BIB ${registration.bib_number} at ${registration.events?.name}. Expires ${new Date(consentCode.expires_at).toLocaleString()}.`

    if (navigator.share) {
      await navigator.share({
        title: 'Pelikat proxy collection code',
        text,
      })
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const consentStatus = getConsentStatus(consentCode)
  const canUseCurrentCode = consentStatus === 'active'

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

          {consentCode ? (
            <div className="space-y-4">
              <div
                className={`rounded-lg p-6 text-center ${
                  canUseCurrentCode
                    ? 'border border-green-500/30 bg-green-500/10'
                    : 'bg-secondary'
                }`}
              >
                <Badge
                  variant={canUseCurrentCode ? 'default' : 'secondary'}
                  className={canUseCurrentCode ? 'mb-3 bg-green-600 hover:bg-green-600' : 'mb-3'}
                >
                  {canUseCurrentCode && <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {consentStatus === 'active'
                    ? 'Active'
                    : consentStatus === 'used'
                    ? 'Used'
                    : 'Expired'}
                </Badge>
                <p className="text-sm text-muted-foreground mb-2">Your Consent Code</p>
                <p className="text-4xl font-mono font-bold tracking-widest">{consentCode.code}</p>
                {consentCode.expires_at && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires: {new Date(consentCode.expires_at).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={handleCopy} disabled={!canUseCurrentCode}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? 'Copied' : 'Copy Code'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleShare}
                  disabled={!canUseCurrentCode}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share Code
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? 'Generating...' : 'Generate New'}
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                {canUseCurrentCode
                  ? 'Give this active code to the person collecting on your behalf. They must also show their own Digital BIB QR at the collection point.'
                  : 'This code can no longer be used. Generate a new code if someone still needs to collect your race pack.'}
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
