import type { SupabaseClient } from '@supabase/supabase-js'
import type { MerchVariant } from '@/lib/merch'

export type StoreProduct = {
  id: string
  name: string
  description: string | null
  price: number
  image_path: string | null
  low_stock_threshold: number
  merch_variants: MerchVariant[]
}

export type StoreEvent = {
  id: string
  name: string
  event_date: string
  location: string | null
}

export type StoreData = {
  event: StoreEvent | null
  registered: boolean
  registrationPaid: boolean
  salesClosed: boolean
  products: StoreProduct[]
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL']

function compareVariants(a: MerchVariant, b: MerchVariant) {
  const sa = SIZE_ORDER.indexOf(a.size?.toUpperCase() ?? '')
  const sb = SIZE_ORDER.indexOf(b.size?.toUpperCase() ?? '')
  if (sa !== sb) return (sa === -1 ? 99 : sa) - (sb === -1 ? 99 : sb)
  return `${a.size ?? ''}${a.color ?? ''}`.localeCompare(`${b.size ?? ''}${b.color ?? ''}`)
}

// Today's date in Malaysia, as YYYY-MM-DD (matches merch_checkout's cut-off)
export function malaysiaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
}

// FR-69: a runner sees the active products of an event they're registered for
// (enforced by RLS on merch_products); checkout also needs a paid registration.
export async function getRunnerStoreData(supabase: SupabaseClient, eventId: string): Promise<StoreData> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase.from('runner_profiles').select('id').eq('user_id', user.id).maybeSingle()
    : { data: null }

  const [{ data: event }, { data: registration }, { data: products }] = await Promise.all([
    supabase.from('events').select('id, name, event_date, location').eq('id', eventId).maybeSingle(),
    profile
      ? supabase
          .from('registrations')
          .select('payment_status')
          .eq('event_id', eventId)
          .eq('runner_id', profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('merch_products')
      .select('id, name, description, price, image_path, low_stock_threshold, merch_variants(id, size, color, stock)')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
  ])

  return {
    event,
    registered: !!registration,
    registrationPaid: registration?.payment_status === 'paid',
    salesClosed: !!event && event.event_date < malaysiaToday(),
    products: ((products ?? []) as StoreProduct[]).map((p) => ({
      ...p,
      price: Number(p.price),
      merch_variants: [...p.merch_variants].sort(compareVariants),
    })),
  }
}
