'use client'

import { CircleAlert, LoaderCircle, User } from "lucide-react"
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface RaceCategory {
  id: string
  name: string
  gender: string | null
  min_age: number | null
  max_age: number | null
  price: number | null
  max_slots: number | null
}

interface RunnerRegistrationActionsProps {
  eventId: string
  categories: RaceCategory[]
  hasRunnerProfile: boolean
  runner: {
    name: string | null
    email: string | null
    tShirtSize: string | null
    emergencyContactName: string | null
    emergencyContactPhone: string | null
    dob: string | null
    gender: string | null
    phone: string | null
    icOnFile: boolean
  }
}

export function RunnerRegistrationActions({
  eventId,
  categories,
  hasRunnerProfile,
  runner,
}: RunnerRegistrationActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? '')

  const handleRegister = () => {
    setError(null)

    if (!hasRunnerProfile) {
      setError('Complete your runner profile before registering.')
      return
    }
    if (!selectedCategoryId) {
      setError('Choose a race category before registering.')
      return
    }

    startTransition(async () => {
      const { error } = await supabase.rpc('register_for_event', {
        p_event_id: eventId,
        p_category_id: selectedCategoryId,
      })
      if (error) {
        // Unique violation on (event_id, runner_id) → HTTP 409 from PostgREST
        setError(
          error.code === '23505' &&
            error.message.includes('registrations_event_runner_unique')
            ? 'You are already registered for this event.'
            : error.message
        )
        return
      }

      // Confirmation email + push (UC11 step 8, FR-29) are sent by the
      // registrations_notify_confirmed trigger once payment lands and the
      // BIB is assigned (migration 084) — nothing to send from here.
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {categories.length > 0 && (
        <div className="flex flex-col gap-2">
          {categories.map((category) => {
            const isSelected = selectedCategoryId === category.id
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                disabled={isPending}
                className={`flex flex-col text-left p-4 rounded-xl border transition-all ${
                  isSelected 
                    ? 'bg-primary/10 border-primary' 
                    : 'bg-card border-border/60 hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex justify-between items-center w-full mb-1">
                  <span className={`text-[14px] font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    {category.name}
                  </span>
                  <span className={`text-[14px] font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    RM {category.price ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{category.gender || 'Any'}</span>
                  <span>•</span>
                  <span>Ages {category.min_age || '0'}-{category.max_age || '99'}</span>
                  {category.max_slots && (
                    <>
                      <span>•</span>
                      <span>{category.max_slots} slots max</span>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Re-registration prefill (FR-46): one-glance saved profile data */}
      {hasRunnerProfile && (
        <div className={`p-4 rounded-xl border ${
          runner.tShirtSize
            ? 'bg-card border-border/60'
            : 'bg-amber-500 dark:bg-amber-400/5 border-amber-500 dark:border-amber-400/30'
        } flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="size-[18px] text-success" />
              <span className="text-[12px] font-bold text-foreground uppercase tracking-wider">Using Your Saved Profile</span>
            </div>
            <a href="/runner/profile" className="text-[11px] font-bold text-primary hover:underline shrink-0">
              Edit
            </a>
          </div>

          <div className="grid gap-2 text-[12px]">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Name</span>
              <span className="text-foreground font-medium text-right truncate">{runner.name || 'Not set'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground font-medium text-right truncate">{runner.email || 'Not set'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Date of Birth</span>
              <span className="text-foreground font-medium text-right truncate">
                {runner.dob ? new Date(runner.dob).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Gender</span>
              <span className="text-foreground font-medium text-right truncate">
                {!!runner.gender && (runner.gender === 'M' ? 'Male' : runner.gender === 'F' ? 'Female' : runner.gender)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">IC / Passport</span>
              <span className={runner.icOnFile ? 'text-success font-medium' : 'text-amber-500 dark:text-amber-400 font-medium'}>
                {/* IC count never leaves the database encrypted; display matches the profile page's own policy. */}
                {runner.icOnFile ? 'Securely on file (encrypted)' : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Phone</span>
              <span className="text-foreground font-medium text-right truncate">{runner.phone || 'Not set'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">T-Shirt Size</span>
              <span className={`font-medium text-right ${runner.tShirtSize ? 'text-foreground' : 'text-amber-500 dark:text-amber-400'}`}>
                {runner.tShirtSize || 'Not set'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Emergency Contact</span>
              <span className={`font-medium text-right truncate ${runner.emergencyContactName ? 'text-foreground' : 'text-amber-500 dark:text-amber-400'}`}>
                {runner.emergencyContactName
                  ? `${runner.emergencyContactName}${runner.emergencyContactPhone ? ` · ${runner.emergencyContactPhone}` : ''}`
                  : 'Not set'}
              </span>
            </div>
          </div>

          {!runner.tShirtSize && (
            <p className="text-[11px] text-amber-500 dark:text-amber-400">Set a t-shirt size in your profile so the right shirt is reserved at REPC.</p>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 dark:bg-red-300/10 border border-red-500/30 dark:border-red-300/20 text-red-500 dark:text-red-300 text-[12px] flex items-center gap-2">
          <CircleAlert className="size-[16px]" />
          {error}
        </div>
      )}

      <button
        onClick={handleRegister}
        disabled={isPending || categories.length === 0}
        className="w-full py-3.5 mt-2 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
      >
        {isPending ? (
          <>
            <LoaderCircle className="size-[18px] animate-spin" />
            Processing...
          </>
        ) : (
          'Register Now'
        )}
      </button>
    </div>
  )
}
