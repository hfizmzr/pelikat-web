'use server'

import { fetchDjangoApi } from '@/lib/django'
import { requireAuth } from '@/lib/auth/requireUser'
import { validateIdentityInput } from '@/lib/nric'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function storeEncryptedIc(
  icNumber: string,
  profile?: { dob?: string | null; gender?: string | null }
) {
  const { supabase, user } = await requireAuth()

  // Mirror of the backend validation (light pre-check; Django is the authority).
  // No client-settable document-path/ciphertext fields are accepted here —
  // ic_encrypted is written only from the Django response.
  const check = validateIdentityInput(icNumber)
  if (!check.valid) {
    throw new Error(check.error)
  }

  // Django encrypt-ic contract (201): {"status":"ok","ic_encrypted":...,
  // "needs_review":bool,"warnings":[...]}. Optional dob/gender enable the
  // backend NRIC cross-check (DOB mismatch is a hard 422; gender mismatch a
  // needs_review warning).
  const result: {
    ic_encrypted?: unknown
    needs_review?: unknown
    warnings?: unknown
  } = await fetchDjangoApi('/ai/documents/encrypt-ic', {
    method: 'POST',
    body: JSON.stringify({
      ic_number: icNumber.trim(),
      user_id: user.id,
      ...(profile?.dob ? { dob: profile.dob } : {}),
      ...(profile?.gender ? { gender: profile.gender } : {}),
    }),
  })

  // Shape-verify before writing: never store a missing/undefined ciphertext.
  if (typeof result.ic_encrypted !== 'string' || !result.ic_encrypted) {
    throw new Error('Document processing service returned an unexpected response')
  }

  const { error } = await supabase
    .from('runner_profiles')
    .update({ ic_encrypted: result.ic_encrypted })
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/runner/profile')
  return {
    needs_review: result.needs_review === true,
    warnings: Array.isArray(result.warnings)
      ? result.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  }
}

export async function deleteDocument() {
  const { supabase, user } = await requireAuth()

  // The encrypted_path is resolved from the runner's own profile row —
  // never trusted from a client argument (the component's prop can be
  // stale/absent after the first upload because the encrypt route does not
  // return the path, and a client-supplied path would be attacker-chosen).
  // Django still enforces the user_id prefix (403 on IDOR/traversal).
  const { data: profile, error: profileError } = await supabase
    .from('runner_profiles')
    .select('ic_document_path')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)

  const storagePath = profile?.ic_document_path ?? null

  if (storagePath) {
    await fetchDjangoApi('/ai/documents/delete', {
      method: 'POST',
      body: JSON.stringify({ user_id: user.id, encrypted_path: storagePath }),
    })
  }

  const { error } = await supabase
    .from('runner_profiles')
    .update({
      ic_document_path: null,
      ic_document_mime: null,
      ic_document_uploaded_at: null,
    })
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/runner/profile')
}

export async function deleteRunnerAccount() {
  const { supabase, user } = await requireAuth()

  const { data: profile } = await supabase
    .from('runner_profiles')
    .select('id, ic_document_path')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile) {
    throw new Error('Profile not found')
  }

  if (profile.ic_document_path) {
    await fetchDjangoApi('/ai/documents/delete', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        encrypted_path: profile.ic_document_path,
      }),
    })
  }

  const { error: anonymizeError } = await supabase.rpc(
    'anonymize_runner_profile',
    { p_runner_id: profile.id }
  )

  if (anonymizeError) {
    throw new Error(`Anonymize failed: ${anonymizeError.message}`)
  }

  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(
    user.id
  )

  if (deleteAuthError) {
    throw new Error(`Delete auth user failed: ${deleteAuthError.message}`)
  }

  redirect('/goodbye')
}
