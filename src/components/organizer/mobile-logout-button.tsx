'use client'

import { LoaderCircle, LogOut } from "lucide-react"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// The mobile console has no sidebar, and installed-PWA organizers are pinned
// to it, so this is their only way out. Confirms first: a stray tap mid-race
// shouldn't drop the session.
export function MobileLogoutButton() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogout = async (e: React.MouseEvent) => {
    // Keep the dialog open until signOut settles so errors stay visible.
    e.preventDefault()
    if (loggingOut) return
    setLoggingOut(true)
    setError(null)

    const { error } = await supabase.auth.signOut()
    if (error) {
      // Session may still be valid — stay here rather than pretend we logged out.
      setError(error.message || 'Failed to log out. Please try again.')
      setLoggingOut(false)
      return
    }
    router.push('/login?switchAccount=1')
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (loggingOut) return
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="size-[20px]" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll need to sign in again to use the organizer console on this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-[12px] text-red-500 dark:text-red-300">{error}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loggingOut}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? <LoaderCircle className="size-[16px] animate-spin" /> : <LogOut className="size-[16px]" />}
            Log out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
