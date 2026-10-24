/**
 * Shared validation for runner profile saves and IC/document submissions.
 * Mirrors migration 072 (runner_profiles_active_full_name_check) on the
 * client- and server-action side; the DB CHECK remains the final authority.
 */

export const MIN_FULL_NAME_LENGTH = 2

export function isValidFullName(name: string | null | undefined): boolean {
  return (name ?? "").trim().length >= MIN_FULL_NAME_LENGTH
}

export const PROFILE_INCOMPLETE_MESSAGE =
  "Complete your profile first: enter your full name, date of birth and gender, and tick the PDPA consent box."

/** Inline errors for the Save action. */
export function profileSaveErrors(
  fullName: string,
  pdpaAgreed: boolean | null | undefined
): { full_name?: string; pdpa?: string } {
  const full_name = isValidFullName(fullName)
    ? undefined
    : `Enter your full name (at least ${MIN_FULL_NAME_LENGTH} characters).`
  const pdpa = isPdpaAgreed(pdpaAgreed)
    ? undefined
    : "You must agree to the PDPA consent before saving your profile."
  return { full_name, pdpa }
}

function isPdpaAgreed(v: boolean | null | undefined): boolean {
  return v === true
}

/**
 * Reason the IC/document path is blocked for a profile, or null when the
 * profile is complete enough to accept an IC/upload.
 */
export function profileIcBlockReason(profile: {
  full_name?: string | null
  dob?: string | null
  gender?: string | null
  pdpa_agreed?: boolean | null
}): string | null {
  if (!isValidFullName(profile.full_name)) return PROFILE_INCOMPLETE_MESSAGE
  if (!profile.dob) return PROFILE_INCOMPLETE_MESSAGE
  if (!profile.gender) return PROFILE_INCOMPLETE_MESSAGE
  if (!isPdpaAgreed(profile.pdpa_agreed)) return PROFILE_INCOMPLETE_MESSAGE
  return null
}
