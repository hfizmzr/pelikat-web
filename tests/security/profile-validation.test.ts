import { describe, expect, it } from 'vitest'
import {
  isValidFullName,
  profileIcBlockReason,
  profileSaveErrors,
  PROFILE_INCOMPLETE_MESSAGE,
} from '@/lib/profile-validation'

/**
 * Red-first for the P3 remediation: profile saves with a blank full_name or
 * unchecked PDPA consent must be rejected with field errors, and the
 * IC/document path must be blocked until the profile is complete (mirrors
 * migration 072's DB CHECK, which stays the final authority).
 */
describe('isValidFullName', () => {
  it('rejects empty, whitespace-only and single-char names', () => {
    expect(isValidFullName('')).toBe(false)
    expect(isValidFullName('   ')).toBe(false)
    expect(isValidFullName(' ')).toBe(false)
    expect(isValidFullName('A')).toBe(false)
    expect(isValidFullName(undefined)).toBe(false)
    expect(isValidFullName(null)).toBe(false)
  })

  it('accepts two or more non-whitespace characters, trimming whitespace', () => {
    expect(isValidFullName('Ab')).toBe(true)
    expect(isValidFullName('  Ali Bin Abu  ')).toBe(true)
  })
})

describe('profileSaveErrors', () => {
  it('returns a full_name error (no silent success) for a blank name', () => {
    const errors = profileSaveErrors('', true)
    expect(errors.full_name).toBeTruthy()
    expect(errors.full_name).toMatch(/full name/i)
    expect(errors.pdpa).toBeUndefined()
  })

  it('returns a pdpa error when consent is unchecked', () => {
    const errors = profileSaveErrors('Ali Bin Abu', false)
    expect(errors.full_name).toBeUndefined()
    expect(errors.pdpa).toMatch(/PDPA/)
  })

  it('rejects unchecked-null consent', () => {
    const errors = profileSaveErrors('Ali Bin Abu', null)
    expect(errors.pdpa).toBeTruthy()
  })

  it('passes with a valid name and consent checked', () => {
    expect(profileSaveErrors('  Ali Bin Abu  ', true)).toEqual({})
  })
})

describe('profileIcBlockReason', () => {
  const complete = { full_name: 'Ali Bin Abu', dob: '1990-01-01', gender: 'M', pdpa_agreed: true }

  it('returns null for a complete profile', () => {
    expect(profileIcBlockReason(complete)).toBeNull()
  })

  it.each([
    ['blank full_name', { ...complete, full_name: '   ' }],
    ['missing dob', { ...complete, dob: null }],
    ['missing gender', { ...complete, gender: '' }],
    ['unchecked pdpa', { ...complete, pdpa_agreed: false }],
  ])('blocks on %s', (_label, profile) => {
    expect(profileIcBlockReason(profile)).toBe(PROFILE_INCOMPLETE_MESSAGE)
  })
})
