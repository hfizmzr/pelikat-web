import { describe, it, expect } from 'vitest'
import {
  validateNric,
  validatePassport,
  validateIdentityInput,
} from '@/lib/nric'

describe('NRIC validation (mirror of backend spec)', () => {
  it('accepts a well-formed NRIC', () => {
    expect(validateNric('900101-14-5123')).toEqual({
      valid: true,
      kind: 'nric',
    })
  })

  it('rejects malformed shapes', () => {
    for (const bad of ['900101-14-512', '900101145123', 'abc', '']) {
      expect(validateNric(bad).valid).toBe(false)
      expect(validateNric(bad).error).toBe(
        'NRIC must be in the format 000000-00-0000.'
      )
    }
  })

  it('rejects invalid calendar dates', () => {
    for (const bad of ['900232-14-5123', '900431-14-5123', '990229-14-5123']) {
      expect(validateNric(bad)).toEqual({
        valid: false,
        kind: 'nric',
        error: 'Date of birth segment invalid.',
      })
    }
    // 2000 is a leap year → Feb 29 valid.
    expect(validateNric('000229-14-5123').valid).toBe(true)
  })

  it('rejects invalid months', () => {
    expect(validateNric('901301-14-5123').error).toBe(
      'Date of birth segment invalid.'
    )
  })

  it('no future dates', () => {
    // The century rule (yy > current 2-digit year → 19yy) already remaps
    // next-year ys to the past, so only same-year future dates are reachable.
    const now = new Date()
    const tomorrow = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1
      )
    )
    const yy = String(tomorrow.getUTCFullYear() % 100).padStart(2, '0')
    const mm = String(tomorrow.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(tomorrow.getUTCDate()).padStart(2, '0')
    const result = validateNric(`${yy}${mm}${dd}-14-1234`)
    if (tomorrow.getUTCFullYear() > now.getUTCFullYear()) {
      // Year rollover: yy maps to 19yy (past) — unreachable future by design.
      expect(result.valid).toBe(true)
    } else {
      expect(result.error).toBe('Date of birth segment invalid.')
    }
  })

  it('century rule: yy > current 2-digit year → 19yy', () => {
    const nowYY = new Date().getUTCFullYear() % 100
    // yy = nowYY+1 → 19(nowYY+1), e.g. 2026 → 1927 (age ~99, still ≤ 130).
    const yy = String(nowYY + 1).padStart(2, '0')
    expect(validateNric(`${yy}0101-14-5123`).valid).toBe(true)
    // yy = nowYY → 20(currentYY), a fresh future-proof identity is rejected
    // only by the future-date rule for a later day; Jan 1 of this year is valid.
    expect(validateNric(`${String(nowYY).padStart(2, '0')}0101-14-5123`).valid).toBe(true)
  })

  it('state codes valid in 01–16 and 21–99', () => {
    expect(validateNric('900101-01-5123').valid).toBe(true)
    expect(validateNric('900101-16-5123').valid).toBe(true)
    expect(validateNric('900101-21-5123').valid).toBe(true)
    expect(validateNric('900101-99-5123').valid).toBe(true)
  })

  it('state codes invalid outside 01–16 ∪ 21–99', () => {
    for (const bad of ['00', '17', '18', '19', '20']) {
      expect(validateNric(`900101-${bad}-5123`)).toEqual({
        valid: false,
        kind: 'nric',
        error: 'State code invalid.',
      })
    }
  })

  it('rejects serial 0000', () => {
    expect(validateNric('900101-14-0000')).toEqual({
      valid: false,
      kind: 'nric',
      error: 'Serial segment cannot be 0000.',
    })
  })
})

describe('Passport validation', () => {
  it('accepts 5–15 alphanumeric', () => {
    expect(validatePassport('A1234567')).toEqual({
      valid: true,
      kind: 'passport',
    })
    expect(validateIdentityInput('A1234567')).toEqual({
      valid: true,
      kind: 'passport',
    })
  })

  it('rejects off-length or symbolic inputs', () => {
    expect(validatePassport('A123').valid).toBe(false)
    expect(validatePassport('A1234567890123456').valid).toBe(false)
    expect(validatePassport('AB 123').valid).toBe(false)
  })
})
