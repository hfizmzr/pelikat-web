/**
 * Canonical identity-input validation — exact mirror of the backend
 * (pelikat-api /ai/documents/encrypt-ic) rules. The server is the authority;
 * these pure functions exist for fast client feedback and identical server-side
 * pre-checks in server actions. Light UX mirror only — never trust these
 * in place of the Django-side validation.
 */

const NRIC_SHAPE = /^\d{6}-\d{2}-\d{4}$/
const PASSPORT_SHAPE = /^[A-Za-z0-9]{5,15}$/

export type IdentityCheck =
  | { valid: true; kind: 'nric' | 'passport' }
  | { valid: false; kind: 'nric' | 'passport'; error: string }

const nricInvalid = (error: string): IdentityCheck => ({
  valid: false,
  kind: 'nric',
  error,
})

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Validate a Malaysian NRIC "000000-00-0000": shape, calendar date
 * (century: yy > current 2-digit year → 19yy else 20yy; no future dates;
 * age ≤ 130), birthplace code ∈ 01–16 ∪ 21–99, serial ≠ 0000. */
export function validateNric(nric: string): IdentityCheck {
  if (!NRIC_SHAPE.test(nric)) {
    return nricInvalid('NRIC must be in the format 000000-00-0000.')
  }

  const [yymmdd, state, serial] = nric.split('-')
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))

  if (mm < 1 || mm > 12) {
    return nricInvalid('Date of birth segment invalid.')
  }

  const currentYY = new Date().getUTCFullYear() % 100
  const year = (yy > currentYY ? 1900 : 2000) + yy
  const maxDay =
    mm === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[mm - 1]
  if (dd < 1 || dd > maxDay) {
    return nricInvalid('Date of birth segment invalid.')
  }

  const today = new Date()
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  )
  const dobUtc = Date.UTC(year, mm - 1, dd)
  if (dobUtc > todayUtc) {
    return nricInvalid('Date of birth segment invalid.')
  }
  if (year < today.getUTCFullYear() - 130) {
    return nricInvalid('Date of birth segment invalid.')
  }

  const stateCode = Number(state)
  const stateValid =
    (stateCode >= 1 && stateCode <= 16) || stateCode >= 21
  if (!stateValid) {
    return nricInvalid('State code invalid.')
  }

  if (serial === '0000') {
    return nricInvalid('Serial segment cannot be 0000.')
  }

  return { valid: true, kind: 'nric' }
}

/** Validate a passport number: 5–15 letters or digits only. */
export function validatePassport(passport: string): IdentityCheck {
  if (!PASSPORT_SHAPE.test(passport)) {
    return {
      valid: false,
      kind: 'passport',
      error:
        'Passport number must be 5–15 letters or digits only (no spaces or symbols).',
    }
  }
  return { valid: true, kind: 'passport' }
}

/** Validate any identity input: NRIC shape → NRIC rules, else passport rules. */
export function validateIdentityInput(value: string): IdentityCheck {
  const trimmed = value.trim()
  if (NRIC_SHAPE.test(trimmed)) return validateNric(trimmed)
  return validatePassport(trimmed)
}
