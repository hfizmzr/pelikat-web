'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
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
        setError(error.message)
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">You haven&apos;t registered for this event yet.</p>

      {categories.length > 1 && (
        <RadioGroup
          value={selectedCategoryId}
          onValueChange={setSelectedCategoryId}
          className="space-y-2"
          disabled={isPending}
        >
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value={category.id} id={`register-category-${category.id}`} />
                <Label htmlFor={`register-category-${category.id}`} className="font-medium">
                  {category.name}
                </Label>
              </div>
              <span className="text-sm font-semibold">RM {category.price ?? 0}</span>
            </div>
          ))}
        </RadioGroup>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        className="w-full"
        onClick={handleRegister}
        disabled={isPending || categories.length === 0}
      >
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Register Now
      </Button>
    </div>
  )
}
