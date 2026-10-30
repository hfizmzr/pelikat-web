'use client'

import { useActionState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReviewPhotoActionState } from '@/components/events/actions'

// Shared plumbing for the photo form actions: useActionState wiring plus an
// automatic router.refresh() whenever the action reports success. Photo
// action components (review/restore/gallery tag) only keep their own layout.
export function usePhotoAction(
  action: (state: ReviewPhotoActionState, formData: FormData) => Promise<ReviewPhotoActionState>
) {
  const router = useRouter()
  const [state, formAction] = useActionState(action, { status: 'idle' })

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh()
    }
  }, [state.status, router])

  return [state, formAction] as const
}

/** Submit button that disables + shows a spinner while its form is pending. */
export function PhotoSubmitButton({
  children,
  variant = 'default',
  className,
  pendingLabel,
}: {
  children: ReactNode
  variant?: 'default' | 'outline' | 'destructive'
  className?: string
  /** Replacement content while pending (defaults to a bare spinner). */
  pendingLabel?: ReactNode
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" variant={variant} className={className} disabled={pending}>
      {pending ? pendingLabel ?? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </Button>
  )
}
