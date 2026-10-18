import { Badge, CircleCheck, Clock, Download, MoreHorizontal, Search, Users } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
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
    paid: 'text-success bg-success/15',
    pending: 'text-primary bg-primary/15',
    failed: 'text-red-500 dark:text-red-300 bg-red-500/10 dark:bg-red-300/15',
    refunded: 'text-muted-foreground bg-accent',
  }

  return (
    <div className="relative w-full min-h-full px-6 py-8 bg-background">
      <div className="absolute -top-32 -right-20 w-96 h-96 bg-primary/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] leading-[14px] tracking-[0.05em] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase w-fit">
              Runner Directory
            </span>
            <h1 className="text-[28px] leading-[36px] tracking-[-0.02em] font-bold text-foreground">Runner Directory & BIBs</h1>
            <p className="text-[14px] leading-[20px] text-muted-foreground">All registrations and BIB assignments across your events.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2.5 bg-card hover:bg-card text-foreground text-[14px] leading-[20px] tracking-[0.01em] font-medium rounded-lg flex items-center gap-2 transition-colors border border-muted">
              <Download className="size-[18px]" />
              Export CSV
            </button>
            <button className="px-4 py-2.5 bg-primary text-primary-foreground text-[14px] leading-[20px] tracking-[0.01em] font-semibold rounded-lg flex items-center gap-2 hover:bg-primary transition-all ">
              <Badge className="size-[18px]" />
              Assign BIBs
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Runners', value: total, icon: Users, color: 'text-primary' },
            { label: 'Confirmed Paid', value: paid, icon: CircleCheck, color: 'text-success' },
            { label: 'Pending Payment', value: pending, icon: Clock, color: 'text-primary' },
            { label: 'BIBs Assigned', value: withBib, icon: Badge, color: 'text-primary' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl p-4 border border-muted flex items-center gap-3">
              <span className={`size-[24px] ${s.color}`}><s.icon className="size-[24px]" /></span>
              <div>
                <div className="text-[24px] leading-[28px] tracking-[-0.01em] font-semibold text-foreground">{s.value.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div className="bg-card rounded-xl p-3 border border-muted flex items-center gap-3">
          <Search className="text-muted-foreground size-[20px] ml-1" />
          <input
            className="flex-1 bg-transparent text-foreground text-[14px] leading-[20px] focus:outline-none placeholder:text-muted-foreground"
            placeholder="Search by name, BIB number, email..."
          />
          <div className="flex gap-1.5">
            {['All', 'Paid', 'Pending', 'No BIB'].map((f, i) => (
              <button key={f} className={`px-2.5 py-1 rounded-lg text-[10px] leading-[14px] tracking-[0.05em] font-semibold transition-colors ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-muted overflow-x-auto">
          <div className="min-w-[800px]">
          <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-0 text-[10px] leading-[14px] tracking-[0.05em] font-semibold text-muted-foreground uppercase px-5 py-3 border-b border-muted bg-card">
            <div className="pr-4">#</div>
            <div>Runner</div>
            <div>Event / Category</div>
            <div className="px-4 text-center">BIB</div>
            <div className="px-4 text-center">Status</div>
            <div className="text-right">Actions</div>
          </div>

          {registrations && registrations.length > 0 ? (
            <div className="divide-y divide-muted">
              {registrations.map((reg, i) => (
                <div key={reg.id} className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-0 items-center px-5 py-3 hover:bg-card transition-colors">
                  <div className="pr-4 text-[12px] text-muted-foreground font-mono">{i + 1}</div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[12px] font-bold shrink-0">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(((reg as any).runner_profiles as any)?.full_name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <div className="text-[14px] leading-[20px] font-medium text-foreground">{((reg as any).runner_profiles as any)?.full_name || 'Unknown'}</div>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <div className="text-[11px] text-muted-foreground">{((reg as any).runner_profiles as any)?.email || '—'}</div>
                    </div>
                  </div>
                  <div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <div className="text-[13px] leading-[20px] text-muted-foreground">{((reg as any).events as any)?.name || '—'}</div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <div className="text-[11px] text-muted-foreground">{((reg as any).race_categories as any)?.name || '—'}</div>
                  </div>
                  <div className="px-4 text-center">
                    {reg.bib_number ? (
                      <span className="px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-mono font-semibold border border-primary/20">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {((reg as any).race_categories as any)?.bib_prefix || ''}{reg.bib_number}
                      </span>
                    ) : (
                      <span className="text-[11px] text-border">—</span>
                    )}
                  </div>
                  <div className="px-4 text-center">
                    <span className={`text-[10px] leading-[14px] px-2 py-0.5 rounded-full font-semibold ${statusColor[reg.payment_status] || statusColor.failed}`}>
                      {reg.payment_status}
                    </span>
                  </div>
                  <div className="text-right">
                    <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors">
                      <MoreHorizontal className="size-[18px]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Badge className="size-[48px] mb-3" />
              <p className="text-[14px] font-medium">No runners registered yet</p>
              <p className="text-[12px] mt-1">Create and publish an event to accept registrations</p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
