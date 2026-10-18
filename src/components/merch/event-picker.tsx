'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { MerchEventOption } from '@/components/merch/queries'

export function MerchEventPicker({ events, value }: { events: MerchEventOption[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <Select value={value} onValueChange={(id) => router.push(`${pathname}?event=${id}`)}>
      <SelectTrigger className="w-full sm:w-72" aria-label="Event">
        <SelectValue placeholder="Select event" />
      </SelectTrigger>
      <SelectContent>
        {events.map((event) => (
          <SelectItem key={event.id} value={event.id}>
            {event.name}
            <span className="ml-2 text-muted-foreground text-[12px]">
              {new Date(event.event_date).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
