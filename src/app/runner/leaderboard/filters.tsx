'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Event {
  id: string
  name: string
}

export function LeaderboardFilters({ events }: { events: Event[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentEvent = searchParams.get('event_id') || 'all'
  const currentGender = searchParams.get('gender') || 'all'

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={currentEvent} onValueChange={(v) => updateParams('event_id', v)}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All events" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All events</SelectItem>
          {events.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={currentGender} onValueChange={(v) => updateParams('gender', v)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All genders" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All genders</SelectItem>
          <SelectItem value="male">Male</SelectItem>
          <SelectItem value="female">Female</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
