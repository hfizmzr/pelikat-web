import { createClient } from '@/lib/supabase/server'
import QRCode from 'qrcode'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchDjangoApi } from '@/lib/django'
import { BibActionButtons } from '@/components/events/bib-action-buttons'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Digital BIB - Pelikat',
  description: 'Your digital race BIB with QR code',
}

export default async function RunnerBibPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, supabase] = await Promise.all([
    params,
    createClient(),
  ])

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id, full_name')
    .eq('user_id', user?.id)
    .single()

  const [{ data: registration }, { data: event }] = await Promise.all([
    supabase
      .from('registrations')
      .select('*, events(*), race_categories(*)')
      .eq('event_id', id)
      .eq('runner_id', profile?.id)
      .single(),
    supabase
      .from('events')
      .select('name, event_date, location')
      .eq('id', id)
      .single(),
  ])

  if (!registration || !event) {
    notFound()
  }

  const isCheckedIn = Boolean(registration.checked_in)
  const checkedInAt = isCheckedIn && registration.checked_in_at
    ? new Date(registration.checked_in_at).toLocaleString()
    : null

  let qrSvg: string | null = null
  let qrError: string | null = null

  try {
    const response = await fetchDjangoApi('/ai/qr/sign', {
      method: 'POST',
      body: JSON.stringify({
        runner_id: profile?.id,
        event_id: id,
        bib_number: registration.bib_number,
      }),
    })

    const qrPayload = typeof response.qr_payload === 'string' ? response.qr_payload : null
    if (!qrPayload) {
      qrError = 'Secure QR code could not be generated.'
    } else {
      qrSvg = await QRCode.toString(qrPayload, {
        type: 'svg',
        width: 220,
        margin: 1,
        color: { dark: isCheckedIn ? '#4edea3' : '#e5e1e4', light: '#00000000' },
      })
    }
  } catch {
    qrError = 'Secure QR service is unavailable.'
  }

  return (
    <div className="flex flex-col w-full min-h-full bg-[#131315]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#131315]/90 backdrop-blur-xl border-b border-[#23232b]">
        <div className="flex items-center h-14 px-4 pt-safe">
          <Link href={`/runner/events/${id}`} className="w-10 h-10 flex items-center justify-center rounded-full text-[#cbc3d7] active:bg-[#1c1b1d] transition-colors -ml-2">
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </Link>
          <h1 className="flex-1 text-[16px] font-bold text-[#e5e1e4] text-center mr-8 truncate">
            Digital BIB
          </h1>
        </div>
      </header>

      <div className="flex flex-col px-5 py-8 items-center max-w-sm mx-auto w-full gap-6">
        
        {/* Ticket Wallet Container */}
        <div className="w-full relative">
          {/* Main Ticket */}
          <div className={`relative overflow-hidden rounded-[2rem] p-6 pt-8 flex flex-col items-center bg-[#1c1b1d] border shadow-2xl ${
            isCheckedIn ? 'border-[#4edea3]/40' : 'border-[#353437]/60'
          }`}>
            
            {/* Blurry glow */}
            <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none ${
              isCheckedIn ? 'bg-[#4edea3]/10' : 'bg-[#d0bcff]/10'
            }`} />

            <div className="relative z-10 flex flex-col items-center w-full">
              {isCheckedIn ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4edea3]/10 text-[#4edea3] border border-[#4edea3]/20 mb-4">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase">Checked In</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d0bcff]/10 text-[#d0bcff] border border-[#d0bcff]/20 mb-4">
                  <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase">Ready for Scan</span>
                </div>
              )}

              <h2 className="text-[12px] font-bold text-[#958ea0] tracking-widest uppercase mb-1">BIB NUMBER</h2>
              <div className="text-[54px] font-mono font-bold text-[#e5e1e4] leading-none mb-6 drop-shadow-md">
                {registration.bib_number}
              </div>

              <div className="w-full h-px bg-gradient-to-r from-transparent via-[#353437] to-transparent mb-6" />

              <div className="w-full flex justify-center mb-6">
                <div className={`p-3 rounded-2xl ${isCheckedIn ? 'bg-[#4edea3]/5' : 'bg-[#e5e1e4]/5'} backdrop-blur-sm border border-[#353437]/40`}>
                  {qrSvg ? (
                    <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  ) : (
                    <div className="w-[220px] h-[220px] flex items-center justify-center text-center text-[#ffb4ab] text-[12px] px-4 border border-dashed border-[#ffb4ab]/30 rounded-xl">
                      {qrError}
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full flex flex-col gap-3 text-center mb-2">
                <div>
                  <h3 className="text-[16px] font-bold text-[#e5e1e4] leading-tight mb-0.5">{profile?.full_name}</h3>
                  <p className="text-[12px] text-[#cbc3d7]">{registration.race_categories?.name}</p>
                </div>
                <div className="w-full h-px bg-[#353437]/40 my-1" />
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-bold text-[#e5e1e4] truncate">{event.name}</span>
                  <span className="text-[11px] text-[#958ea0]">
                    {new Date(event.event_date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {checkedInAt && (
                    <span className="text-[10px] text-[#4edea3] mt-1">Scanned at {checkedInAt}</span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Cutouts for ticket effect */}
            <div className="absolute top-[65%] -left-3 w-6 h-6 rounded-full bg-[#131315] border-r border-[#353437]/60" />
            <div className="absolute top-[65%] -right-3 w-6 h-6 rounded-full bg-[#131315] border-l border-[#353437]/60" />
          </div>
        </div>

        <BibActionButtons
          bibNumber={registration.bib_number}
          eventName={event.name}
        />

        <Link
          href={`/runner/events/${id}/bib/consent`}
          className="w-full py-3.5 mt-2 rounded-xl border border-[#353437] text-[#cbc3d7] text-[13px] font-bold flex items-center justify-center gap-2 active:bg-[#1c1b1d] transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">group</span>
          Generate Proxy Collection Code
        </Link>
        
        <div className="bg-[#1c1b1d] p-4 rounded-xl border border-[#353437]/40 w-full mt-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[18px] text-[#4cd7f6]">info</span>
            <span className="text-[13px] font-bold text-[#e5e1e4]">Instructions</span>
          </div>
          <ol className="text-[12px] text-[#958ea0] space-y-2 list-decimal list-inside marker:text-[#cbc3d7]">
            <li>Show this QR code at the check-in counter on race day.</li>
            <li>Ensure your screen brightness is turned up.</li>
            <li>Take a screenshot as a backup.</li>
          </ol>
        </div>

      </div>
    </div>
  )
}
