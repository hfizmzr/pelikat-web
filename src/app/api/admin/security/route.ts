import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getUserRole } from '@/lib/auth/requireRole'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const role = getUserRole(authData.user)
  if (role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const [
    { count: organizersCount },
    { count: runnersCount },
    { count: pdpaConsentedCount },
    { count: auditLogsCount },
  ] = await Promise.all([
    supabaseAdmin.from('organizers').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('runner_profiles').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('runner_profiles').select('id', { count: 'exact', head: true }).eq('pdpa_agreed', true),
    supabaseAdmin.from('audit_log').select('id', { count: 'exact', head: true }),
  ])

  const consentRate = runnersCount && runnersCount > 0
    ? Math.round(((pdpaConsentedCount ?? 0) / runnersCount) * 100)
    : 100

  const iamRoles = [
    {
      role: 'Super Admin',
      scope: 'Platform-wide full access & system configuration',
      count: 1,
      color: 'text-[#ffb4ab] bg-[#ffb4ab]/10 border-[#ffb4ab]/20',
      description: 'Break-glass operator account with global service-role overrides',
    },
    {
      role: 'Tenant Organizer',
      scope: 'Scoped to own event tenant and participant roster',
      count: organizersCount ?? 0,
      color: 'text-[#d0bcff] bg-[#d0bcff]/10 border-[#d0bcff]/20',
      description: 'Tenants managing race logistics, categories, and bib check-in',
    },
    {
      role: 'Runner / Athlete',
      scope: 'Read-own profile & race registration write access',
      count: runnersCount ?? 0,
      color: 'text-[#4edea3] bg-[#4edea3]/10 border-[#4edea3]/20',
      description: 'End-users registered for marathons and virtual running events',
    },
    {
      role: 'Anonymous / Guest',
      scope: 'Public race discovery and landing pages only',
      count: 'Unmetered',
      color: 'text-[#958ea0] bg-[#958ea0]/10 border-[#958ea0]/20',
      description: 'Public visitors browsing event calendars without active sessions',
    },
  ]

  const policies = [
    {
      name: 'Multi-Tenant Row-Level Security (RLS)',
      scope: 'PostgreSQL Database Engine',
      status: 'enforced',
      icon: 'lock',
      color: 'text-[#4edea3]',
      detail: 'Mandatory tenant isolation on all tables via get_my_organizer_id()',
    },
    {
      name: 'Super-Admin JWT Role Assertion',
      scope: 'Edge Middleware & Next.js App Router',
      status: 'enforced',
      icon: 'verified_user',
      color: 'text-[#4edea3]',
      detail: 'Cryptographic token validation verifying role=admin claim',
    },
    {
      name: 'PDPA Consent Gate & Data Protection',
      scope: 'Runner Profile Service',
      status: 'enforced',
      icon: 'policy',
      color: 'text-[#4edea3]',
      detail: `${pdpaConsentedCount ?? 0} of ${runnersCount ?? 0} athletes consented (${consentRate}%)`,
    },
    {
      name: 'Encrypted IC/Passport Storage Vault',
      scope: 'Supabase Storage Private Buckets',
      status: 'enforced',
      icon: 'encrypted',
      color: 'text-[#4edea3]',
      detail: 'AES-256 encrypted server-side storage with signed expiring URLs',
    },
    {
      name: 'Audit Trail & Immutable Event Logging',
      scope: 'Audit Log Trigger Layer',
      status: 'enforced',
      icon: 'history',
      color: 'text-[#4edea3]',
      detail: `${auditLogsCount ?? 0} administrative and security audit events recorded`,
    },
    {
      name: 'OAuth2 Org-Level Single Sign-On (SSO)',
      scope: 'Organizer Tenant Portals',
      status: 'planned',
      icon: 'login',
      color: 'text-[#ffb4ab]',
      detail: 'SAML 2.0 and Google Workspace tenant federation roadmap',
    },
  ]

  return NextResponse.json({
    success: true,
    stats: {
      totalIdentities: 1 + (organizersCount ?? 0) + (runnersCount ?? 0),
      organizersCount: organizersCount ?? 0,
      runnersCount: runnersCount ?? 0,
      pdpaConsentRate: `${consentRate}%`,
      auditLogsCount: auditLogsCount ?? 0,
    },
    iamRoles,
    policies,
  })
}
