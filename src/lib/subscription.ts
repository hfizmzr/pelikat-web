import 'server-only'
import { createClient } from '@/lib/supabase/server'

/**
 * Single-tier organizer subscription price, read from platform_settings
 * (key `organizer_subscription_price`, seeded by migration 073).
 *
 * MONEY CONVENTION: MYR decimal (99.00 = RM99.00). Never integer sen.
 * Reads are request-time fresh — nothing here caches; callers that render
 * the price on a page must keep that page dynamic (client pages should
 * fetch /api/subscription/price rather than embedding this module).
 */

export interface OrganizerSubscriptionPrice {
  amount: number
  currency: 'MYR'
  period: string
  durationDays: number
}

// Fallback when the settings row is missing/unparseable — mirrors the
// migration 073 seed ({"amount": 99.00, "currency": "MYR", "period":
// "year", "duration_days": 365}).
export const DEFAULT_ORGANIZER_SUBSCRIPTION_PRICE: OrganizerSubscriptionPrice =
  { amount: 99, currency: 'MYR', period: 'year', durationDays: 365 }

function parsePrice(raw: unknown): OrganizerSubscriptionPrice | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const amount = Number(value.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const durationDays = Number(value.duration_days)
  return {
    amount,
    currency: 'MYR',
    period: typeof value.period === 'string' && value.period ? value.period : 'year',
    durationDays:
      Number.isInteger(durationDays) && durationDays > 0 ? durationDays : 365,
  }
}

/**
 * Read the configured organizer subscription price. Falls back to the
 * seeded defaults whenever the row is missing or malformed. Pass a
 * supabase client to reuse an existing request-scoped client (the reader
 * creates one otherwise).
 */
export async function getOrganizerSubscriptionPrice(
  supabase?: Awaited<ReturnType<typeof createClient>>
): Promise<OrganizerSubscriptionPrice> {
  try {
    const client = supabase ?? (await createClient())
    const { data } = await client
      .from('platform_settings')
      .select('value')
      .eq('key', 'organizer_subscription_price')
      .maybeSingle()
    return parsePrice(data?.value) ?? DEFAULT_ORGANIZER_SUBSCRIPTION_PRICE
  } catch {
    return DEFAULT_ORGANIZER_SUBSCRIPTION_PRICE
  }
}

/** Format a MYR decimal amount, e.g. formatMYR(99) → "RM 99.00". */
export function formatMYR(amount: number): string {
  return `RM ${amount.toFixed(2)}`
}
