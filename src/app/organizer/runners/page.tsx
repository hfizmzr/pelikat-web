import { Badge, CircleCheck, Clock, Users } from "lucide-react"
import { createClient } from '@/lib/supabase/server'
import { isConfirmedStatus } from '@/lib/registration-status'
import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
import { ExportCsvButton } from '@/components/organizer/export-csv-button'
import { RunnerDirectoryTable, type RunnerDirectoryRow } from '@/components/organizer/runner-directory-table'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Runner Directory & BIBs - Organizer Hub | Pelikat',
  description: 'View and manage runner registrations and BIB assignments across all your events',
}

const EXPORT_HEADERS = ['BIB Number', 'Runner Name', 'Event', 'Category', 'Payment Status', 'Checked In', 'Registration Date'] as const

export default async function OrganizerRunnersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  const { data: registrations } = await supabase
    .from('registrations')
    .select(`
      id, bib_number, payment_status, checked_in, created_at, runner_id,
      events(id, name, event_date),
      race_categories(id, name, bib_prefix)
    `)
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Re-attach runner names via the organizer-safe view (raw
  // runner_profiles rows / embeds are no longer organizer-readable)
  const profileById = await getSafeRunnerProfiles(
    supabase,
    (registrations ?? []).map(reg => (reg as { runner_id?: string | null }).runner_id)
  )

  const rows: RunnerDirectoryRow[] = (registrations ?? []).map((reg) => {
    const r = reg as {
      id: string
      bib_number: string | null
      payment_status: string
      events?: { name: string | null }[] | null
      race_categories?: { name: string | null; bib_prefix: string | null }[] | null
    }
    const profile = profileById.get((reg as { runner_id?: string | null }).runner_id ?? '')
    return {
      id: r.id,
      bib_number: r.bib_number,
      payment_status: r.payment_status,
      runnerName: profile?.full_name ?? null,
      eventName: r.events?.[0]?.name ?? null,
      categoryName: r.race_categories?.[0]?.name ?? null,
      bibPrefix: r.race_categories?.[0]?.bib_prefix ?? null,
    }
  })

  const total = rows.length
  const paid = rows.filter(r => isConfirmedStatus(r.payment_status)).length
  const pending = rows.filter(r => r.payment_status === 'pending').length
  const withBib = rows.filter(r => r.bib_number).length

  // Audit #8: Export CSV was dead — reuse the admin export pattern
  // (rowsToCsv + Blob download, via the shared ExportCsvButton).
  const exportRows = (registrations ?? []).map((reg) => {
    const r = reg as {
      bib_number: string | null
      checked_in: boolean | null
      payment_status: string
      created_at: string
      events?: { name: string | null }[] | null
      race_categories?: { name: string | null }[] | null
    }
    const profile = profileById.get((reg as { runner_id?: string | null }).runner_id ?? '')
    return [
      r.bib_number || '',
      profile?.full_name || 'Unknown',
      r.events?.[0]?.name || '',
      r.race_categories?.[0]?.name || '',
      r.payment_status,
      r.checked_in ? 'YES' : 'NO',
      new Date(r.created_at).toISOString(),
    ] as const
  })

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
            <ExportCsvButton filename={`runners-${new Date().toISOString().slice(0, 10)}.csv`} headers={EXPORT_HEADERS} rows={exportRows}>
              Export CSV
            </ExportCsvButton>
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
            { label: 'Confirmed', value: paid, icon: CircleCheck, color: 'text-success' },
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

        <RunnerDirectoryTable rows={rows} />
      </div>
    </div>
  )
}
