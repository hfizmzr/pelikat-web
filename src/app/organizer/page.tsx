import { createClient } from '@/lib/supabase/server'
import { isConfirmedStatus } from '@/lib/registration-status'
import { getSafeRunnerProfiles } from '@/lib/runner-profiles-safe'
import { OrganizerConsole } from '@/components/organizer/console-view'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Operations Console - Organizer Hub | Pelikat',
  description: 'Real-time event operations command center for race directors',
}

export default async function OrganizerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const organizerId = user?.app_metadata?.organizer_id

  // Fetch events with registrations and categories
  const [{ data: events }, { data: recentRegistrations }, { data: merchProducts }] = await Promise.all([
    supabase
      .from('events')
      .select(`
        id, name, status, event_date, location,
        race_categories(id, name, max_slots, bib_prefix),
        registrations(id, payment_status, checked_in, category_id, bib_number)
      `)
      .eq('organizer_id', organizerId)
      .order('event_date', { ascending: true })
      .limit(10),
    supabase
      .from('registrations')
      .select(`
        id, payment_status, created_at, runner_id, bib_number,
        events(name),
        race_categories(name)
      `)
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
      .limit(8),
    // Audit #5: the console's "Merch SKUs" filter pill had nothing to show —
    // load the organizer's SKUs so the pill filters to a real list.
    supabase
      .from('merch_products')
      .select(`
        id, name, price, is_active,
        events(name),
        merch_variants(stock)
      `)
      .eq('organizer_id', organizerId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Re-attach runner names via the organizer-safe view (raw
  // runner_profiles rows / embeds are no longer organizer-readable)
  const recentProfileById = await getSafeRunnerProfiles(
    supabase,
    (recentRegistrations ?? []).map(reg => (reg as { runner_id?: string | null }).runner_id)
  )

  // Aggregate stats
  const allRegs = events?.flatMap(e => e.registrations || []) || []
  const confirmedRunners = allRegs.filter(r => isConfirmedStatus(r.payment_status)).length
  const checkedIn = allRegs.filter(r => r.checked_in).length
  const totalRunners = allRegs.length
  const repcRate = totalRunners > 0 ? Math.round((checkedIn / totalRunners) * 100) : 0

  // Current / upcoming event (first non-past event or latest)
  const now = new Date()
  const activeEvent = events?.find(e => new Date(e.event_date) >= now) || events?.[0]
  const daysRemaining = activeEvent
    ? Math.max(0, Math.ceil((new Date(activeEvent.event_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  // Categories for active event
  const activeCategories = activeEvent?.race_categories || []

  // Registration velocity (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: velocityData } = await supabase
    .from('registrations')
    .select('created_at')
    .eq('organizer_id', organizerId)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: true })

  // Group into days for simple bar chart. Keys are ISO dates (yyyy-MM-dd,
  // server-local timezone) so the client can filter the 30d/14d/today
  // windows by string comparison; the console renders the day-of-month
  // label by slicing the key. Dates are formatted SERVER-SIDE and passed as
  // strings — the console renders from a client component, and
  // locale/timezone formatting would otherwise hydrate differently.
  const dayMap: Record<string, number> = {}
  velocityData?.forEach(r => {
    const day = new Date(r.created_at).toLocaleDateString('en-CA')
    dayMap[day] = (dayMap[day] || 0) + 1
  })
  const velocityDays = Object.entries(dayMap)

  // Recent registrations, names resolved + dates pre-formatted
  const recent = (recentRegistrations ?? []).map((reg) => {
    const r = reg as unknown as {
      id: string
      payment_status: string
      created_at: string
      bib_number: string | null
      // Many-to-one embeds return an OBJECT (or null), not an array — the
      // generated supabase types mis-model the cardinality as one-to-many,
      // so the cast goes through unknown (same shape the event-detail and
      // financial pages read).
      events?: { name: string | null } | null
      race_categories?: { name: string | null } | null
    }
    return {
      id: r.id,
      paymentStatus: r.payment_status,
      createdAtLabel: new Date(r.created_at).toLocaleDateString('en-MY'),
      runnerName: recentProfileById.get((reg as { runner_id?: string | null }).runner_id ?? '')?.full_name ?? null,
      eventName: r.events?.name ?? null,
      categoryName: r.race_categories?.name ?? null,
      bib: r.bib_number ?? null,
    }
  })

  const eventCards = (events ?? []).map((e) => {
    const regs = e.registrations || []
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      location: e.location,
      eventDateLabel: new Date(e.event_date).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }),
      regCount: regs.length,
      paidCount: regs.filter((r: { payment_status: string }) => isConfirmedStatus(r.payment_status)).length,
      catCount: (e.race_categories || []).length,
    }
  })

  const merch = (merchProducts ?? []).map((p) => {
    const m = p as unknown as {
      id: string
      name: string
      price: number | null
      is_active: boolean | null
      // Many-to-one embed — object (or null), not an array. merch_variants
      // stays an array (one-to-many).
      events?: { name: string | null } | null
      merch_variants?: { stock: number | null }[] | null
    }
    return {
      id: m.id,
      name: m.name,
      price: Number(m.price ?? 0),
      isActive: !!m.is_active,
      eventName: m.events?.name ?? null,
      stock: (m.merch_variants ?? []).reduce((a, v) => a + Number(v.stock ?? 0), 0),
    }
  })

  return (
    <OrganizerConsole
      activeEvent={activeEvent ? {
        id: activeEvent.id,
        name: activeEvent.name,
        status: activeEvent.status,
        location: activeEvent.location,
        daysRemaining,
      } : null}
      waves={(activeCategories ?? []).map(c => {
        const cat = c as { id: string; name: string; bib_prefix: string | null; max_slots: number | null }
        // Real per-wave fill: count the active event's registrations by
        // category (category_id rides along on the existing registrations
        // join — no extra query).
        const regCount = (activeEvent?.registrations || []).filter(
          (r: { category_id?: string | null }) => r.category_id === cat.id
        ).length
        return { id: cat.id, name: cat.name, bibPrefix: cat.bib_prefix, maxSlots: cat.max_slots, regCount }
      })}
      recent={recent}
      velocityDays={velocityDays}
      events={eventCards}
      merch={merch}
      kpis={{
        confirmedRunners,
        totalRunners,
        repcRate,
        checkedIn,
        eventsTotal: events?.length || 0,
        publishedCount: events?.filter(e => e.status === 'published').length || 0,
        draftCount: events?.filter(e => e.status === 'draft').length || 0,
      }}
    />
  )
}
