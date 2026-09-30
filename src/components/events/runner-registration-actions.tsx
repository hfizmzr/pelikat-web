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
}

export function RunnerRegistrationActions({
  eventId,
  categories,
  hasRunnerProfile,
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
