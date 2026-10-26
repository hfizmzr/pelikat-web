'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, ShieldCheck, Trash2, UserPlus, Mail, CheckCircle } from "lucide-react"
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'

interface AdminUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [selfId, setSelfId] = useState<string | null>(null)

  const [promoteEmail, setPromoteEmail] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [granting, setGranting] = useState(false)

  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null)
  const [revoking, setRevoking] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      if (json.success) {
        setUsers(json.users)
      } else {
        toast.error(json.error || 'Failed to load admin users')
      }
    } catch {
      toast.error('Network error loading admin users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    createClient().auth.getUser().then(({ data }) => setSelfId(data.user?.id ?? null))
  }, [fetchUsers])

  const grant = async (mode: 'promote' | 'invite') => {
    const email = (mode === 'promote' ? promoteEmail : inviteEmail).trim()
    if (!email) {
      toast.error('Enter an email first.')
      return
    }
    setGranting(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, mode }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.message || 'Admin role granted.')
        if (mode === 'promote') setPromoteEmail('')
        else setInviteEmail('')
        await fetchUsers()
      } else {
        toast.error(json.error || 'Failed to grant admin role.')
      }
    } catch {
      toast.error('Network error granting admin role.')
    } finally {
      setGranting(false)
    }
  }

  const revoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: revokeTarget.id }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`Admin role revoked for ${revokeTarget.email}.`)
        setRevokeOpen(false)
        await fetchUsers()
      } else {
        toast.error(json.error || 'Failed to revoke admin role.')
      }
    } catch {
      toast.error('Network error revoking admin role.')
    } finally {
      setRevoking(false)
    }
  }

  const fmtDate = (value: string | null) =>
    value ? new Date(value).toISOString().slice(0, 10) : '—'

  return (
    <div className="flex flex-col gap-8 font-inter text-foreground">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-[16px] text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary font-inter">Access Control</span>
          </div>
          <h1 className="font-jakarta font-bold text-[28px] text-foreground tracking-tight">Admin Users</h1>
          <p className="text-[13px] text-muted-foreground">Grant platform administrator access, invite new admins, and revoke roles</p>
        </div>
        <button
          onClick={() => fetchUsers()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-foreground text-[13px] font-medium hover:bg-accent hover:text-primary transition-all border border-border/30"
        >
          <RefreshCw className={`size-[16px] ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Grant Access ───────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="p-5 border-b border-border/30 flex items-center gap-2">
          <UserPlus className="text-primary size-[20px]" />
          <div>
            <h2 className="font-jakarta font-semibold text-[16px] text-foreground">Grant Admin Access</h2>
            <p className="text-[11px] text-muted-foreground font-inter">Promote an existing runner/organizer, or invite a brand-new admin by email</p>
          </div>
        </div>
        <div className="p-5 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-muted-foreground font-inter" htmlFor="promote-email">
              Promote Existing User
            </label>
            <div className="flex gap-2">
              <Input
                id="promote-email"
                type="email"
                placeholder="existing-user@example.com"
                value={promoteEmail}
                onChange={(e) => setPromoteEmail(e.target.value)}
                className="bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
              />
              <Button
                size="sm"
                className="shrink-0"
                disabled={granting || !promoteEmail.trim()}
                onClick={() => grant('promote')}
              >
                {granting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                Promote
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground font-inter">Sets app_metadata.role = admin on an existing account.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-muted-foreground font-inter" htmlFor="invite-email">
              Invite New Admin
            </label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                placeholder="new-admin@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="bg-card border-border/40 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary rounded-lg text-[13px]"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={granting || !inviteEmail.trim()}
                onClick={() => grant('invite')}
              >
                {granting ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                Invite
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground font-inter">Creates the account with the admin role and sends an invitation email.</p>
          </div>
        </div>
      </div>

      {/* ── Admin List ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-card border border-border/30 overflow-hidden shadow-lg">
        <div className="p-5 border-b border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary size-[20px]" />
            <h2 className="font-jakarta font-semibold text-[18px] text-foreground">Current Admins</h2>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">{users.length} admins</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30">
                {['Email', 'Created', 'Last Sign In', ''].map((h) => (
                  <th key={h || 'actions'} className="py-3 px-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/30 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                    <span>Loading admin users...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">No admin users found</td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSelf = user.id === selfId
                  return (
                    <tr key={user.id} className="hover:bg-card/50 transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="font-semibold text-foreground font-jakarta">{user.email}</span>
                        {isSelf && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold border border-primary/20 font-inter">
                            You
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 font-mono text-[12px] text-muted-foreground">{fmtDate(user.created_at)}</td>
                      <td className="py-3.5 px-5 font-mono text-[12px] text-muted-foreground">{fmtDate(user.last_sign_in_at)}</td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-800/10 hover:bg-red-800/30 text-red-500 dark:text-red-300 text-[12px] font-semibold font-inter transition-colors border border-red-500/30 dark:border-red-300/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          disabled={isSelf || revoking}
                          title={isSelf ? 'You cannot remove your own admin role.' : undefined}
                          onClick={() => {
                            setRevokeTarget(user)
                            setRevokeOpen(true)
                          }}
                        >
                          <Trash2 className="size-[14px]" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-border/30 text-[11px] text-muted-foreground font-inter">
          Runners never need an account tier — revoking admin access returns an account to the standard role. Your own admin role cannot be removed here.
        </div>
      </div>

      {/* ── Revoke Confirmation Dialog ────────────────────────────── */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="bg-card border border-border/40 text-foreground rounded-xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-[18px] text-foreground flex items-center gap-2">
              <Trash2 className="size-[20px] text-red-500 dark:text-red-300" />
              Revoke Admin Role
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-inter text-[13px]">
              Remove admin access for <strong className="text-foreground">{revokeTarget?.email}</strong>? The account stays intact and keeps any
              organizer role — only platform administration access is removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <button
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent text-foreground text-[13px] font-medium font-inter transition-colors border border-border/30"
              onClick={() => setRevokeOpen(false)}
            >
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-800/20 hover:bg-red-800/40 text-red-500 dark:text-red-300 text-[13px] font-semibold font-inter transition-colors border border-red-500/30 dark:border-red-300/20 disabled:opacity-50"
              disabled={revoking}
              onClick={revoke}
            >
              {revoking && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="size-[18px]" />
              Revoke Admin Role
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
