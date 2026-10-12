'use client'

import { ArrowLeft, Check, CheckCheck, CircleAlert, CircleCheck, Clock, Copy, Info, LoaderCircle, Share2, X } from "lucide-react"
import { use, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
      <div className="flex flex-col w-full min-h-full bg-background items-center justify-center">
        <span className="size-[32px] text-muted-foreground animate-spin"><LoaderCircle className="size-[32px] text-muted-foreground animate-spin" /></span>
      </div>
    )
  }

  const consentStatus = getConsentStatus(consentCode)
  const canUseCurrentCode = consentStatus === 'active'

  return (
    <div className="flex flex-col w-full min-h-full bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-muted">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href={`/runner/events/${id}/bib`} className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-card transition-colors -ml-2">
            <span className="size-[24px]"><ArrowLeft className="size-[24px]" /></span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-foreground leading-tight">
              Proxy Collection
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto">
        <div className="flex flex-col text-center">
          <h2 className="text-[20px] font-bold text-foreground mb-1">Generate Code</h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Share this code with the person collecting your race pack on your behalf. Valid for 24 hours.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-300/10 border border-red-300/20 text-red-300 text-[12px] flex items-center gap-2">
            <span className="size-[16px]"><CircleAlert className="size-[16px]" /></span>
            {error}
          </div>
        )}

        <section className="bg-card rounded-2xl border border-border/60 overflow-hidden flex flex-col p-5 gap-4">
          
          {consentCode ? (
            <div className="flex flex-col gap-4">
              <div
                className={`rounded-2xl p-6 flex flex-col items-center text-center border relative overflow-hidden ${
                  canUseCurrentCode
                    ? 'border-success/30 bg-success/5'
                    : 'bg-muted border-border/60'
                }`}
              >
                {canUseCurrentCode && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 blur-2xl rounded-full -mt-4 -mr-4 pointer-events-none" />
                )}
                
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase mb-4 ${
                  canUseCurrentCode 
                    ? 'bg-success/10 text-success border border-success/20'
                    : consentStatus === 'used'
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-red-300/10 text-red-300 border border-red-300/20'
                }`}>
                  {canUseCurrentCode ? (
                    <CircleCheck className="size-[14px]" />
                  ) : consentStatus === 'used' ? (
                    <CheckCheck className="size-[14px]" />
                  ) : (
                    <X className="size-[14px]" />
                  )}
                  {consentStatus === 'active' ? 'Active' : consentStatus === 'used' ? 'Used' : 'Expired'}
                </div>
                
                <p className="text-[12px] text-muted-foreground tracking-widest uppercase mb-1">Your Consent Code</p>
                <p className={`text-[42px] font-mono font-bold tracking-widest leading-none mb-3 ${canUseCurrentCode ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {consentCode.code}
                </p>
                
                {consentCode.expires_at && (
                  <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                    <span className="size-[14px]"><Clock className="size-[14px]" /></span>
                    Expires: {new Date(consentCode.expires_at).toLocaleString('en-MY', { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button 
                    onClick={handleCopy} 
                    disabled={!canUseCurrentCode}
                    className="flex-1 py-3 rounded-xl bg-accent text-foreground text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {copied ? (
                      <Check className="size-[18px]" />
                    ) : (
                      <Copy className="size-[18px]" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button 
                    onClick={handleShare} 
                    disabled={!canUseCurrentCode}
                    className="flex-1 py-3 rounded-xl bg-accent text-foreground text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <span className="size-[18px]"><Share2 className="size-[18px]" /></span>
                    Share
                  </button>
                </div>
                <button 
                  onClick={handleGenerate} 
                  disabled={generating}
                  className="w-full py-3.5 mt-2 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <span className="animate-spin size-[18px]"><LoaderCircle className="animate-spin size-[18px]" /></span>
                      Generating...
                    </>
                  ) : (
                    'Generate New Code'
                  )}
                </button>
              </div>
              
              <div className="mt-2 p-4 bg-muted rounded-xl flex items-start gap-3 border border-border/40">
                <span className="size-[20px] text-primary shrink-0"><Info className="size-[20px] text-primary shrink-0" /></span>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {canUseCurrentCode
                    ? 'Give this active code to your proxy collector. They must show their own QR pass at the collection point.'
                    : 'This code is no longer valid. Please generate a new code if someone still needs to collect your pack.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="bg-muted p-4 rounded-xl border border-border/60 flex flex-col gap-3">
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-muted-foreground">Event</span>
                  <span className="text-foreground font-medium max-w-[150px] truncate">{registration?.events?.name}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-muted-foreground">BIB</span>
                  <span className="font-mono text-foreground font-medium">{registration?.bib_number}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-muted-foreground">Category</span>
                  <span className="text-foreground font-medium">{registration?.race_categories?.name}</span>
                </div>
              </div>

              <button 
                onClick={handleGenerate} 
                disabled={generating}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <span className="animate-spin size-[18px]"><LoaderCircle className="animate-spin size-[18px]" /></span>
                    Generating...
                  </>
                ) : (
                  'Generate Code'
                )}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
