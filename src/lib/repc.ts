import type { SupabaseClient } from '@supabase/supabase-js'

export type RepcCheckInResult = {
  success: boolean
  message: string
  registrationId: string | null
  bibNumber: string | null
  runnerName: string | null
  shirtSize: string | null
  remainingQty: number | null
  alreadyCheckedIn: boolean
  merch?: MerchHandover | null
}

export type MerchHandoverOrder = { orderNumber: string; itemCount: number }

// Merch orders handed over at this scan, and paid orders the organizer hasn't packed yet
export type MerchHandover = {
  collected: MerchHandoverOrder[]
  notPacked: MerchHandoverOrder[]
}

export type RepcCheckInRpcRow = {
  success: boolean | null
  message: string | null
  registration_id: string | null
  bib_number: string | null
  runner_name: string | null
  shirt_size: string | null
  remaining_qty: number | null
  already_checked_in: boolean | null
}

export function normalizeRepcCheckInResult(row: RepcCheckInRpcRow | null): RepcCheckInResult {
  return {
    success: row?.success ?? false,
    message: row?.message ?? 'Could not complete check-in.',
    registrationId: row?.registration_id ?? null,
    bibNumber: row?.bib_number ?? null,
    runnerName: row?.runner_name ?? null,
    shirtSize: row?.shirt_size ?? null,
    remainingQty: row?.remaining_qty ?? null,
    alreadyCheckedIn: row?.already_checked_in ?? false,
  }
}

type MerchCollectRow = {
  order_number: string
  item_count: number
  collected: boolean
}

// Marks the runner's `ready` merch orders `collected` after a successful REPC scan.
// A failure here must not fail the check-in itself, so errors are logged and
// reported as null (the organizer can still mark orders collected in Merch Hub).
export async function collectMerchOnCheckIn(
  supabase: SupabaseClient,
  eventId: string,
  runnerId: string
): Promise<MerchHandover | null> {
  const { data, error } = await supabase.rpc('merch_collect_for_runner', {
    p_event_id: eventId,
    p_runner_id: runnerId,
  })

  if (error) {
    console.error('merch_collect_for_runner RPC error:', { message: error.message, eventId, runnerId })
    return null
  }

  const rows = (data ?? []) as MerchCollectRow[]
  const toOrder = (row: MerchCollectRow) => ({ orderNumber: row.order_number, itemCount: row.item_count })

  return {
    collected: rows.filter((row) => row.collected).map(toOrder),
    notPacked: rows.filter((row) => !row.collected).map(toOrder),
  }
}
