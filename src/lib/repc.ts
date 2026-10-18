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
  // Only returned by repc_check_in_with_merch(); null when check-in failed
  merch?: { order_number: string; item_count: number; collected: boolean }[] | null
}

// REPC check-in and merch hand-over run in one transaction (migration 063), so a
// successful check-in always means the runner's `ready` orders were collected.
export const REPC_CHECK_IN_RPC = 'repc_check_in_with_merch'

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
    merch: row?.merch ? toMerchHandover(row.merch) : null,
  }
}

function toMerchHandover(rows: NonNullable<RepcCheckInRpcRow['merch']>): MerchHandover {
  const toOrder = (row: (typeof rows)[number]) => ({ orderNumber: row.order_number, itemCount: row.item_count })
  return {
    collected: rows.filter((row) => row.collected).map(toOrder),
    notPacked: rows.filter((row) => !row.collected).map(toOrder),
  }
}
