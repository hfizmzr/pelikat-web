'use server'

import { fetchDjangoApi } from '@/lib/django'
import { requireAuth } from '@/lib/auth/requireUser'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function storeEncryptedDocument(result: {
  encrypted_path: string
  ic_encrypted?: string
}) {
  const { supabase, user } = await requireAuth()

  const updateData: Record<string, string> = {
    ic_document_path: result.encrypted_path,
    ic_document_mime: 'image/jpeg',
    ic_document_uploaded_at: new Date().toISOString(),
  }

  if (result.ic_encrypted) {
    updateData.ic_encrypted = result.ic_encrypted
  }

  const { error } = await supabase
    .from('runner_profiles')
    .update(updateData)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)

  revalidatePath('/runner/profile')
}

export async function deleteDocument(storagePath: string | null) {
  const { supabase, user } = await requireAuth()

  if (storagePath) {
    await fetchDjangoApi('/ai/documents/delete', {
      method: 'POST',
      body: JSON.stringify({ encrypted_path: storagePath }),
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
      body: JSON.stringify({ encrypted_path: profile.ic_document_path }),
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
