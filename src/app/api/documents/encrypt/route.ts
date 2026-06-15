import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('document')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No document provided' }, { status: 400 })
  }

  const djangoFormData = new FormData()
  djangoFormData.append('document', file)
  djangoFormData.append('user_id', user.id)

  const djangoUrl = process.env.DJANGO_URL || 'http://localhost:8000'
  const internalKey = process.env.INTERNAL_API_KEY || 'dummy-internal-api-key-12345'

  let djangoResponse: Response
  try {
    djangoResponse = await fetch(`${djangoUrl}/ai/documents/encrypt`, {
      method: 'POST',
      headers: { 'X-Internal-Key': internalKey },
      body: djangoFormData,
    })
  } catch {
    return NextResponse.json(
      { error: 'Document processing service unavailable' },
      { status: 502 }
    )
  }

  const data = await djangoResponse.json()

  return NextResponse.json(data, { status: djangoResponse.status })
}
