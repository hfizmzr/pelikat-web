import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Runner Directory & BIBs - Organizer Hub | Pelikat',
  description: 'View and manage runner registrations and BIB assignments across all your events',
}

export default async function OrganizerRunnersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  const { data: registrations } = await supabase
    .from('registrations')
    .select(`
      id, bib_number, payment_status, checked_in, created_at,
      runner_profiles(id, full_name, email, gender, phone),
      events(id, name, event_date),
      race_categories(id, name, bib_prefix)
    `)
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false })
    .limit(100)

  const total = registrations?.length || 0
  const paid = registrations?.filter(r => r.payment_status === 'paid').length || 0
  const pending = registrations?.filter(r => r.payment_status === 'pending').length || 0
  const withBib = registrations?.filter(r => r.bib_number).length || 0

  const statusColor: Record<string, string> = {
    paid: 'text-[#4edea3] bg-[#4edea3]/15',
    pending: 'text-[#d0bcff] bg-[#d0bcff]/15',
    failed: 'text-[#ffb4ab] bg-[#ffb4ab]/15',
    refunded: 'text-[#cbc3d7] bg-[#353437]',
  }

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-[#131315]">
      <div className="absolute -top-32 -right-20 w-96 h-96 bg-[#d0bcff]/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-[#d0bcff]/10 text-[#e9ddff] uppercase w-fit">
              Runner Directory
            </span>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-[#e5e1e4]">Runner Directory & BIBs</h1>
            <p className="text-[14px] leading-[20px] text-[#cbc3d7]">All registrations and BIB assignments across your events.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2.5 bg-[#1c1b1d] hover:bg-[#201f22] text-[#e5e1e4] text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-2 transition-colors border border-[#23232b]">
              <span className="material-symbols-outlined text-[18px]">file_download</span>
              Export CSV
            </button>
            <button className="px-4 py-2.5 bg-[#d0bcff] text-[#3c0091] text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-[#a078ff] transition-all shadow-[0_0_16px_rgba(208,188,255,0.25)]">
              <span className="material-symbols-outlined text-[18px]">badge</span>
              Assign BIBs
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Runners', value: total, icon: 'group', color: 'text-[#d0bcff]' },
            { label: 'Confirmed Paid', value: paid, icon: 'check_circle', color: 'text-[#4edea3]' },
            { label: 'Pending Payment', value: pending, icon: 'schedule', color: 'text-[#d0bcff]' },
            { label: 'BIBs Assigned', value: withBib, icon: 'badge', color: 'text-[#4cd7f6]' },
          ].map(s => (
            <div key={s.label} className="bg-[#1c1b1d] rounded-xl p-4 border border-[#23232b] flex items-center gap-3">
              <span className={`material-symbols-outlined text-[24px] ${s.color}`}>{s.icon}</span>
              <div>
                <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-[#e5e1e4]">{s.value.toLocaleString()}</div>
                <div className="text-[11px] text-[#958ea0]">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div className="bg-[#1c1b1d] rounded-xl p-3 border border-[#23232b] flex items-center gap-3">
          <span className="material-symbols-outlined text-[#958ea0] text-[20px] ml-1">search</span>
          <input
            className="flex-1 bg-transparent text-[#e5e1e4] text-[14px] leading-[20px] focus:outline-none placeholder:text-[#958ea0]"
            placeholder="Search by name, BIB number, email..."
          />
          <div className="flex gap-1.5">
            {['All', 'Paid', 'Pending', 'No BIB'].map((f, i) => (
              <button key={f} className={`px-2.5 py-1 rounded-lg text-[10px] leading-[14px] tracking-[0.05em] font-semibold transition-colors ${i === 0 ? 'bg-[#a078ff] text-[#340080]' : 'bg-[#201f22] text-[#cbc3d7] hover:bg-[#2a2a2c]'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#1c1b1d] rounded-xl border border-[#23232b] overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-0 text-[10px] leading-[14px] tracking-[0.05em] font-semibold text-[#958ea0] uppercase px-5 py-3 border-b border-[#23232b] bg-[#201f22]">
            <div className="pr-4">#</div>
            <div>Runner</div>
            <div>Event / Category</div>
            <div className="px-4 text-center">BIB</div>
            <div className="px-4 text-center">Status</div>
            <div className="text-right">Actions</div>
          </div>

          {registrations && registrations.length > 0 ? (
            <div className="divide-y divide-[#23232b]">
              {registrations.map((reg, i) => (
                <div key={reg.id} className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-0 items-center px-5 py-3 hover:bg-[#201f22] transition-colors">
                  <div className="pr-4 text-[12px] text-[#958ea0] font-mono">{i + 1}</div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#d0bcff]/20 flex items-center justify-center text-[#d0bcff] text-[12px] font-bold shrink-0">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(((reg as any).runner_profiles as any)?.full_name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <div className="text-[14px] leading-[20px] font-medium text-[#e5e1e4]">{((reg as any).runner_profiles as any)?.full_name || 'Unknown'}</div>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <div className="text-[11px] text-[#958ea0]">{((reg as any).runner_profiles as any)?.email || '—'}</div>
                    </div>
                  </div>
                  <div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <div className="text-[13px] leading-[20px] text-[#cbc3d7]">{((reg as any).events as any)?.name || '—'}</div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <div className="text-[11px] text-[#958ea0]">{((reg as any).race_categories as any)?.name || '—'}</div>
                  </div>
                  <div className="px-4 text-center">
                    {reg.bib_number ? (
                      <span className="px-2.5 py-1 rounded-lg bg-[#d0bcff]/15 text-[#d0bcff] text-[11px] font-mono font-semibold border border-[#d0bcff]/20">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {((reg as any).race_categories as any)?.bib_prefix || ''}{reg.bib_number}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#494454]">—</span>
                    )}
                  </div>
                  <div className="px-4 text-center">
                    <span className={`text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold ${statusColor[reg.payment_status] || statusColor.failed}`}>
                      {reg.payment_status}
                    </span>
                  </div>
                  <div className="text-right">
                    <button className="p-1.5 text-[#958ea0] hover:text-[#e5e1e4] hover:bg-[#2a2a2c] rounded-lg transition-colors">
                      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-[#958ea0]">
              <span className="material-symbols-outlined text-[48px] mb-3">badge</span>
              <p className="text-[14px] font-medium">No runners registered yet</p>
              <p className="text-[12px] mt-1">Create and publish an event to accept registrations</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
