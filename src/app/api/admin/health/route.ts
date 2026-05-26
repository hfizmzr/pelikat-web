import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const checks: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> = {}

  const { error } = await supabase.from('organizers').select('id').limit(1)
  if (!error) {
    checks.database = { status: 'healthy', message: 'Database connection successful' }
  } else {
    checks.database = { status: 'unhealthy', message: error.message }
  }

  const { error: authError } = await supabase.auth.getUser()
  if (!authError) {
    checks.auth = { status: 'healthy', message: 'Auth service operational' }
  } else {
    checks.auth = { status: 'unhealthy', message: authError.message }
  }

  const resendApiKey = process.env.RESEND_API_KEY
  if (resendApiKey) {
    checks.email = { status: 'healthy', message: 'Email service configured' }
  } else {
    checks.email = { status: 'degraded', message: 'Email service not configured' }
  }

  const overallStatus = Object.values(checks).some((c) => c.status === 'unhealthy')
    ? 'unhealthy'
    : Object.values(checks).some((c) => c.status === 'degraded')
      ? 'degraded'
      : 'healthy'

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  })
}
