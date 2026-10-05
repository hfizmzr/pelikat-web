'use client'

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
  }
  eventSummary: {
    name: string
    date: string
    location: string | null
  }
}

export function RunnerRegistrationActions({
  eventId,
  categories,
  hasRunnerProfile,
  runner,
  eventSummary,
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
      const { data, error } = await supabase.rpc('register_for_event', {
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

      // Fire-and-forget confirmation email (UC11 step 8). The edge
      // function is a no-op stub when RESEND_API_KEY is absent.
      const category = categories.find((c) => c.id === selectedCategoryId)
      void supabase.functions
        .invoke('send-transactional-email', {
          body: {
            type: 'registration_confirmation',
            runnerEmail: runner.email,
            runnerName: 'Runner',
            eventName: eventSummary.name,
            eventDate: eventSummary.date,
            location: eventSummary.location,
            categoryName: category?.name ?? '',
            bibNumber: data?.bib_number ?? '',
            eventUrl: `${window.location.origin}/runner/events/${eventId}/bib`,
          },
        })
        .then((res) => {
          if (res.error || !res.data?.success) {
            console.error('send-transactional-email failed:', res.error || res.data)
          }
        })
        .catch((err) => {
          console.error('send-transactional-email error:', err)
        })

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
                    ? 'bg-[#d0bcff]/10 border-[#d0bcff]' 
                    : 'bg-[#1c1b1d] border-[#353437]/60 hover:border-[#cbc3d7]/30'
                }`}
              >
                <div className="flex justify-between items-center w-full mb-1">
                  <span className={`text-[14px] font-bold ${isSelected ? 'text-[#d0bcff]' : 'text-[#e5e1e4]'}`}>
                    {category.name}
                  </span>
                  <span className={`text-[14px] font-bold ${isSelected ? 'text-[#d0bcff]' : 'text-[#e5e1e4]'}`}>
                    RM {category.price ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#958ea0]">
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
            ? 'bg-[#1c1b1d] border-[#353437]/60'
            : 'bg-[#e3c45b]/5 border-[#e3c45b]/30'
        } flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#4edea3]">person</span>
              <span className="text-[12px] font-bold text-[#e5e1e4] uppercase tracking-wider">Using Your Saved Profile</span>
            </div>
            <a href="/runner/profile" className="text-[11px] font-bold text-[#d0bcff] hover:underline shrink-0">
              Edit
            </a>
          </div>

          <div className="grid gap-2 text-[12px]">
            <div className="flex justify-between gap-3">
              <span className="text-[#958ea0]">Name</span>
              <span className="text-[#e5e1e4] font-medium text-right truncate">{runner.name || 'Not set'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#958ea0]">Email</span>
              <span className="text-[#e5e1e4] font-medium text-right truncate">{runner.email || 'Not set'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#958ea0]">T-Shirt Size</span>
              <span className={`font-medium text-right ${runner.tShirtSize ? 'text-[#e5e1e4]' : 'text-[#e3c45b]'}`}>
                {runner.tShirtSize || 'Not set'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#958ea0]">Emergency Contact</span>
              <span className={`font-medium text-right truncate ${runner.emergencyContactName ? 'text-[#e5e1e4]' : 'text-[#e3c45b]'}`}>
                {runner.emergencyContactName
                  ? `${runner.emergencyContactName}${runner.emergencyContactPhone ? ` · ${runner.emergencyContactPhone}` : ''}`
                  : 'Not set'}
              </span>
            </div>
          </div>

          {!runner.tShirtSize && (
            <p className="text-[11px] text-[#e3c45b]">Set a t-shirt size in your profile so the right shirt is reserved at REPC.</p>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[#ffb4ab] text-[12px] flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
        </div>
      )}

      <button
        onClick={handleRegister}
        disabled={isPending || categories.length === 0}
        className="w-full py-3.5 mt-2 rounded-xl bg-[#d0bcff] text-[#3c0091] text-[14px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
      >
        {isPending ? (
          <>
            <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            Processing...
          </>
        ) : (
          'Register Now'
        )}
      </button>
    </div>
  )
}
