import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getDjangoConfig } from '@/lib/django'

/** Contract (pelikat-api /ai/documents/encrypt, 201):
 * {status:'ok', document_path, document_mime, uploaded_at,
 *  nric_encrypted|null, needs_review, warnings} */
interface DjangoEncryptedDocument {
  status: string
  document_path: string
  document_mime: string
  uploaded_at?: string
  nric_encrypted?: string | null
  needs_review?: boolean
  warnings?: string[]
}

// Generic client-facing messages only — Django internals are never proxied.
const DJANGO_ERROR_MAP: Record<number, { status: number; error: string }> = {
  413: { status: 413, error: 'Document is too large. The maximum size is 10MB.' },
  415: {
    status: 415,
    error: 'Unsupported file type. Accepted formats: JPEG, PNG, WebP.',
  },
  422: {
    status: 422,
    error:
      'Document failed the pre-check. Make sure a valid IC/Passport number is clearly visible and try again.',
  },
  429: {
    status: 429,
    error: 'Too many attempts. Please wait a minute and try again.',
  },
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The profile row must exist before we accept a document for it: the
  // write below is a record-keeping UPDATE, and zero matched rows would
  // otherwise be reported as success.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('runner_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 502 })
  }
  if (!profile) {
    return NextResponse.json(
      { error: 'Save your profile first' },
      { status: 409 }
    )
  }

  const formData = await request.formData()
  const file = formData.get('document')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No document provided' }, { status: 400 })
  }

  const djangoFormData = new FormData()
  djangoFormData.append('document', file)
  djangoFormData.append('user_id', user.id)

  let djangoResponse: Response
  try {
    const { djangoUrl, internalApiKey } = getDjangoConfig()
    djangoResponse = await fetch(`${djangoUrl}/ai/documents/encrypt`, {
      method: 'POST',
      headers: { 'X-Internal-Key': internalApiKey },
      body: djangoFormData,
    })
  } catch {
    return NextResponse.json(
      { error: 'Document processing service unavailable' },
      { status: 502 }
    )
  }

  if (!djangoResponse.ok) {
    const mapped =
      DJANGO_ERROR_MAP[djangoResponse.status] ??
      { status: 502, error: 'Document processing service error' }
    return NextResponse.json(
      { error: mapped.error },
      { status: mapped.status }
    )
  }

  let data: unknown
  try {
    data = await djangoResponse.json()
  } catch {
    return NextResponse.json(
      { error: 'Document processing service error' },
      { status: 502 }
    )
  }

  // Verify the response shape before trusting anything in it.
  if (
    !data ||
    typeof data !== 'object' ||
    (data as DjangoEncryptedDocument).status !== 'ok' ||
    typeof (data as DjangoEncryptedDocument).document_path !== 'string' ||
    typeof (data as DjangoEncryptedDocument).document_mime !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Document processing service error' },
      { status: 502 }
    )
  }

  const encrypted = data as DjangoEncryptedDocument

  const updateData: Record<string, string> = {
    ic_document_path: encrypted.document_path,
    ic_document_mime: encrypted.document_mime,
    ic_document_uploaded_at:
      typeof encrypted.uploaded_at === 'string'
        ? encrypted.uploaded_at
        : new Date().toISOString(),
  }

  if (encrypted.nric_encrypted) {
    updateData.ic_encrypted = encrypted.nric_encrypted
  }

  // Migration 070: runner_profiles IC columns are service-written only —
  // the DB trigger reverts them for every non-service-role caller.
  const { data: updated, error } = await supabaseAdmin
    .from('runner_profiles')
    .update(updateData)
    .eq('user_id', user.id)
    .select('id')

  if (error || !updated || updated.length === 0) {
    return NextResponse.json({ error: 'Failed to record document' }, { status: 502 })
  }

  return NextResponse.json({
    status: 'ok',
    needs_review: encrypted.needs_review === true,
    warnings: Array.isArray(encrypted.warnings) ? encrypted.warnings : [],
  })
}
