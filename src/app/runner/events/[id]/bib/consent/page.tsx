'use client'

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
      <div className="flex flex-col w-full min-h-full bg-[#131315] items-center justify-center">
        <span className="material-symbols-outlined text-[32px] text-[#cbc3d7] animate-spin">progress_activity</span>
      </div>
    )
  }

  const consentStatus = getConsentStatus(consentCode)
  const canUseCurrentCode = consentStatus === 'active'

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href={`/runner/events/${id}/bib`} className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <div className="flex-1 flex flex-col items-center mr-8 truncate">
            <h1 className="text-[16px] font-bold text-[#e5e1e4] leading-tight">
              Proxy Collection
            </h1>
          </div>
        </div>
      </header>

      <div className="flex flex-col px-5 py-6 gap-6 max-w-sm w-full mx-auto">
        <div className="flex flex-col text-center">
          <h2 className="text-[20px] font-bold text-[#e5e1e4] mb-1">Generate Code</h2>
          <p className="text-[13px] text-[#958ea0] leading-relaxed">
            Share this code with the person collecting your race pack on your behalf. Valid for 24 hours.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {error}
          </div>
        )}

        <section className="bg-[#1c1b1d] rounded-2xl border border-[#353437]/60 overflow-hidden flex flex-col p-5 gap-4">
          
          {consentCode ? (
            <div className="flex flex-col gap-4">
              <div
                className={`rounded-2xl p-6 flex flex-col items-center text-center border relative overflow-hidden ${
                  canUseCurrentCode
                    ? 'border-[#4edea3]/30 bg-[#4edea3]/5'
                    : 'bg-[#23232b] border-[#353437]/60'
                }`}
              >
                {canUseCurrentCode && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#4edea3]/10 blur-2xl rounded-full -mt-4 -mr-4 pointer-events-none" />
                )}
                
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase mb-4 ${
                  canUseCurrentCode 
                    ? 'bg-[#4edea3]/10 text-[#4edea3] border border-[#4edea3]/20'
                    : consentStatus === 'used'
                      ? 'bg-[#d0bcff]/10 text-[#d0bcff] border border-[#d0bcff]/20'
                      : 'bg-[#ffb4ab]/10 text-[#ffb4ab] border border-[#ffb4ab]/20'
                }`}>
                  <span className="material-symbols-outlined text-[14px]">
                    {canUseCurrentCode ? 'check_circle' : consentStatus === 'used' ? 'done_all' : 'cancel'}
                  </span>
                  {consentStatus === 'active' ? 'Active' : consentStatus === 'used' ? 'Used' : 'Expired'}
                </div>
                
                <p className="text-[12px] text-[#958ea0] tracking-widest uppercase mb-1">Your Consent Code</p>
                <p className={`text-[42px] font-mono font-bold tracking-widest leading-none mb-3 ${canUseCurrentCode ? 'text-[#e5e1e4]' : 'text-[#958ea0]'}`}>
                  {consentCode.code}
                </p>
                
                {consentCode.expires_at && (
                  <p className="text-[11px] text-[#958ea0] flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
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
                    className="flex-1 py-3 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button 
                    onClick={handleShare} 
                    disabled={!canUseCurrentCode}
                    className="flex-1 py-3 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">share</span>
                    Share
                  </button>
                </div>
                <button 
                  onClick={handleGenerate} 
                  disabled={generating}
                  className="w-full py-3.5 mt-2 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                      Generating...
                    </>
                  ) : (
                    'Generate New Code'
                  )}
                </button>
              </div>
              
              <div className="mt-2 p-4 bg-[#23232b] rounded-xl flex items-start gap-3 border border-[#353437]/40">
                <span className="material-symbols-outlined text-[20px] text-[#4cd7f6] shrink-0">info</span>
                <p className="text-[12px] text-[#cbc3d7] leading-relaxed">
                  {canUseCurrentCode
                    ? 'Give this active code to your proxy collector. They must show their own QR pass at the collection point.'
                    : 'This code is no longer valid. Please generate a new code if someone still needs to collect your pack.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="bg-[#23232b] p-4 rounded-xl border border-[#353437]/60 flex flex-col gap-3">
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#958ea0]">Event</span>
                  <span className="text-[#e5e1e4] font-medium max-w-[150px] truncate">{registration?.events?.name}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#958ea0]">BIB</span>
                  <span className="font-mono text-[#e5e1e4] font-medium">{registration?.bib_number}</span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#958ea0]">Category</span>
                  <span className="text-[#e5e1e4] font-medium">{registration?.race_categories?.name}</span>
                </div>
              </div>

              <button 
                onClick={handleGenerate} 
                disabled={generating}
                className="w-full py-3.5 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
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
