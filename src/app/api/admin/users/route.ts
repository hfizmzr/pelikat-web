import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/service-role'
import { getUserRole } from '@/lib/auth/requireRole'
import { logAudit } from '@/lib/audit'
import { NextResponse } from 'next/server'

// Admin account management: list admins, promote/invite by email, revoke.
// All writes go through the service-role auth admin API; every method
// re-checks the caller's role from their live session (the admin layout is
// a client-side barrier only — the real guard must be here).

type AdminUserInfo = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
}

const EMAIL_HINT =
  "No existing user with that email. Use mode 'invite' to send an invitation instead."

// Walk all auth users via the service-role admin API and collect admins.
// listUsers paginates (default 50/page); loop until a short page returns.
async function listAdminUsers(): Promise<AdminUserInfo[]> {
  const admins: AdminUserInfo[] = []
  const perPage = 200
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    })
    if (error) throw new Error(error.message)
    for (const user of data.users) {
      if (getUserRole(user) === 'admin') {
        admins.push({
          id: user.id,
          email: user.email ?? '',
          created_at: user.created_at ?? '',
          last_sign_in_at: user.last_sign_in_at ?? null,
        })
      }
    }
    if (data.users.length < perPage) break
  }
  return admins
}

// Find an auth user by email (case-insensitive). Returns null when absent.
async function findUserByEmail(email: string) {
  const needle = email.trim().toLowerCase()
  const perPage = 200
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    })
    if (error) throw new Error(error.message)
    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === needle
    )
    if (found) return found
    if (data.users.length < perPage) return null
  }
}

// Shared RBAC preamble: resolves the request-scoped supabase client, the
// caller's user and an error response when the caller is not an admin.
async function requireAdmin() {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      ),
    }
  }

  if (getUserRole(authData.user) !== 'admin') {
    return {
      error: NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      ),
    }
  }

  return { supabase, user: authData.user }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  try {
    const users = await listAdminUsers()
    return NextResponse.json({ success: true, users })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed to list users' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const mode = body?.mode
  const roleMetadata = { app_metadata: { role: 'admin' } }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: 'A valid email is required' },
      { status: 400 }
    )
  }
  if (mode !== 'promote' && mode !== 'invite') {
    return NextResponse.json(
      { success: false, error: "mode must be 'promote' or 'invite'" },
      { status: 400 }
    )
  }

  try {
    const existing = await findUserByEmail(email)

    // Idempotency: an admin that already exists and already has the role
    // returns the current state without a duplicate grant. In invite mode
    // the resend IS the action — but only while the password-less account
    // is still waiting on the invite (unconfirmed email); a confirmed
    // admin is fully set up and must not get point-loop invites.
    if (existing && getUserRole(existing) === 'admin') {
      if (mode === 'invite' && !existing.email_confirmed_at) {
        const { error: inviteError } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(email)
        if (inviteError) {
          return NextResponse.json(
            { success: false, error: `Invite resend failed: ${inviteError.message}` },
            { status: 500 }
          )
        }
        return NextResponse.json({
          success: true,
          alreadyAdmin: true,
          message: `${email} is already an admin (email unconfirmed). Invitation resent.`,
        })
      }
      return NextResponse.json({
        success: true,
        alreadyAdmin: true,
        message: `${email} is already an admin.`,
      })
    }

    if (existing) {
      // promote path with a matching account (also reached when an 'invite'
      // names an existing non-admin — granting is the intended outcome,
      // creating a duplicate invite for the same identity is not).
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
        existing.id,
        roleMetadata
      )
      if (error || !data.user) {
        return NextResponse.json(
          { success: false, error: error?.message ?? 'Failed to update user role' },
          { status: 500 }
        )
      }
      await logAudit(supabase, 'admin_role_granted', existing.id, {
        target_email: data.user.email ?? email,
        mode,
      })
      return NextResponse.json({
        success: true,
        alreadyAdmin: false,
        message: `${data.user.email ?? email} is now an admin.`,
      })
    }

    if (mode === 'promote') {
      return NextResponse.json(
        { success: false, error: EMAIL_HINT },
        { status: 404 }
      )
    }

    // invite: inviteUserByEmail cannot set app_metadata (it only accepts
    // user_metadata), so create the auth user with the admin role first,
    // then send the invitation email.
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      ...roleMetadata,
    })
    if (error || !data.user) {
      return NextResponse.json(
        { success: false, error: error?.message ?? 'Failed to create user' },
        { status: 500 }
      )
    }

    // The role grant is the audited fact — write it now, before the invite
    // attempt. If the email send fails below, the admin must still have a
    // trail (an unaudited admin is untraceable); the failed resend is
    // recoverable via a retry, which hits the already-admin invite path.
    await logAudit(supabase, 'admin_role_granted', data.user.id, {
      target_email: email,
      mode,
    })

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email
    )
    if (inviteError) {
      // The admin WAS created and audited — only the email failed. Keep the
      // response shape (success/alreadyAdmin/message) so the caller can
      // surface the partial state; a retry re-sends the invite.
      return NextResponse.json({
        success: true,
        alreadyAdmin: true,
        message: `Admin user created for ${email}, but the invitation email failed: ${inviteError.message}. Retry to resend the invitation.`,
      })
    }

    return NextResponse.json({
      success: true,
      alreadyAdmin: false,
      message: `Invitation sent to ${email}.`,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed to grant admin role' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase, user } = gate

  const body = await request.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''

  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'userId is required' },
      { status: 400 }
    )
  }

  // Self-demotion guard (the real wall — the UI only disables the button).
  if (userId === user.id) {
    return NextResponse.json(
      { success: false, error: 'You cannot remove your own admin role.' },
      { status: 400 }
    )
  }

  try {
    // Resolve the target first: only admins may be revoked, and the role
    // reverting is the app's default tier (runner), never destructive.
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (error || !data.user) {
      return NextResponse.json(
        { success: false, error: error?.message ?? 'User not found' },
        { status: 404 }
      )
    }

    if (getUserRole(data.user) !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'User is not an admin.' },
        { status: 400 }
      )
    }

    // app_metadata merges key-by-key (organizer_id and other claims are
    // preserved); the role falls back to the app's lowest tier.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { app_metadata: { role: 'runner' } }
    )
    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    await logAudit(supabase, 'admin_role_revoked', userId, {
      target_email: data.user.email ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Failed to revoke admin role' },
      { status: 500 }
    )
  }
}
