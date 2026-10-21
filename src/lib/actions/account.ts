'use server'

import { fetchDjangoApi } from '@/lib/django'
import { requireAuth } from '@/lib/auth/requireUser'
import { validateIdentityInput } from '@/lib/nric'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function storeEncryptedIc(icNumber: string) {
  const { supabase, user } = await requireAuth()

  // Mirror of the backend validation (light pre-check; Django is the authority).
  // No client-settable document-path/ciphertext fields are accepted here —
  // ic_encrypted is written only from the Django response.
  const check = validateIdentityInput(icNumber)
  if (!check.valid) {
    throw new Error(check.error)
  }

  const result: { ic_encrypted: string } = await fetchDjangoApi(
    '/ai/documents/encrypt-ic',
    {
      method: 'POST',
      body: JSON.stringify({ ic_number: icNumber.trim(), user_id: user.id }),
    }
  )

  const { error } = await supabase
    .from('runner_profiles')
    .update({ ic_encrypted: result.ic_encrypted })
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/runner/profile')
}

export async function deleteDocument(storagePath: string | null) {
  const { supabase, user } = await requireAuth()

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
