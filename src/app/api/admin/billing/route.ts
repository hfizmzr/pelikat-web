import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getUserRole } from '@/lib/auth/requireRole'
import { getOrganizerSubscriptionPrice, formatMYR } from '@/lib/subscription'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role = getUserRole(authData.user)
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // 1. Fetch organizers to calculate tenant subscriptions & MRR
  const { data: organizers } = await supabaseAdmin
    .from('organizers')
    .select('id, name, slug, is_active, sub_expires_at, created_at')
    .order('created_at', { ascending: false })

  // Real DB-configured organizer subscription price (admin-configurable).
  const subPrice = await getOrganizerSubscriptionPrice()

  const activeOrganizers = organizers?.filter((o) => o.is_active) ?? []
  const totalOrganizers = organizers?.length ?? 0
  // Monthly-recurring estimate: annual subscription price amortized over 12.
  const mrr = (activeOrganizers.length * subPrice.amount) / 12

  // 2. Fetch paid registrations with categories to calculate GPV (Gross Platform Volume) and escrow
  const { data: paidRegs } = await supabaseAdmin
    .from('registrations')
    .select(`
      id,
      bib_number,
      payment_status,
      created_at,
      events:event_id (id, name),
      race_categories:category_id (id, name, price),
      organizers:organizer_id (id, name, slug)
    `)
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: false })
    .limit(100)

  // 3. Pending registrations
  const { count: pendingCount } = await supabaseAdmin
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('payment_status', 'pending')

  let grossPlatformVolume = 0
  for (const reg of paidRegs || []) {
    const price = Number((reg.race_categories as { price?: number } | null)?.price || 0)
    grossPlatformVolume += price
  }

  // 4. Synthesize transactions ledger from recent registrations & tenant subscriptions
  const transactions = (paidRegs || []).slice(0, 15).map((reg) => {
    const price = Number((reg.race_categories as { price?: number } | null)?.price || 0)
    const eventName = (reg.events as { name?: string } | null)?.name || 'Event Registration'
    const orgName = (reg.organizers as { name?: string } | null)?.name || 'Platform Tenant'
    return {
      id: reg.id,
      tenant: orgName,
      description: `${eventName} (BIB #${reg.bib_number})`,
      plan: 'Registration Fee',
      amount: `RM ${price.toFixed(2)}`,
      rawAmount: price,
      date: new Date(reg.created_at).toISOString().slice(0, 10),
      status: 'paid',
    }
  })

  // Add organizer tenant invoices (real DB-configured subscription price)
  for (const org of (organizers || []).slice(0, 5)) {
    transactions.unshift({
      id: `sub-${org.id}`,
      tenant: org.name,
      description: `Organizer Subscription (${subPrice.period})`,
      plan: 'Organizer Subscription',
      amount: formatMYR(subPrice.amount),
      rawAmount: subPrice.amount,
      date: new Date(org.created_at).toISOString().slice(0, 10),
      status: org.is_active ? 'paid' : 'overdue',
    })
  }

  return NextResponse.json({
    success: true,
    summary: {
      mrr: `RM ${mrr.toLocaleString()}`,
      activeSubscriptions: activeOrganizers.length,
      totalTenants: totalOrganizers,
      escrowHeld: `RM ${(grossPlatformVolume * 0.95).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      grossVolume: `RM ${grossPlatformVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      pendingCount: pendingCount ?? 0,
      overdueCount: organizers?.filter((o) => !o.is_active).length ?? 0,
    },
    invoices: transactions.slice(0, 20),
  })
}
