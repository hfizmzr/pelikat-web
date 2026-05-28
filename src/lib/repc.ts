export type RepcCheckInResult = {
  success: boolean
  message: string
  registrationId: string | null
  bibNumber: string | null
  runnerName: string | null
  shirtSize: string | null
  remainingQty: number | null
  alreadyCheckedIn: boolean
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
