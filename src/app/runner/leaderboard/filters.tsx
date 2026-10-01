'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Event {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
}

export function LeaderboardFilters({
  events,
  categories,
  showCategories,
}: {
  events: Event[]
  categories?: Category[]
  showCategories?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentEvent = searchParams.get('event_id') || 'all'
  const currentGender = searchParams.get('gender') || 'all'
  const currentCategory = searchParams.get('category_id') || 'all'

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    // category belongs to the selected event only
    if (key === 'event_id' && params.get('category_id')) {
      params.delete('category_id')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-2 flex-1">
      <div className="relative flex-[2]">
        <select
          value={currentEvent}
          onChange={(e) => updateParams('event_id', e.target.value)}
          className="w-full h-10 px-3 pr-8 appearance-none rounded-xl bg-[#23232b] border border-[#353437] text-[13px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
        >
          <option value="all">{showCategories ? 'All events' : 'All events'}</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[#958ea0] pointer-events-none text-[20px]">expand_more</span>
      </div>

      {showCategories && categories && categories.length > 0 && (
        <div className="relative flex-1">
          <select
            value={currentCategory}
            onChange={(e) => updateParams('category_id', e.target.value)}
            className="w-full h-10 px-3 pr-8 appearance-none rounded-xl bg-[#23232b] border border-[#353437] text-[13px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[#958ea0] pointer-events-none text-[20px]">expand_more</span>
        </div>
      )}

      <div className="relative flex-1">
        <select
          value={currentGender}
          onChange={(e) => updateParams('gender', e.target.value)}
          className="w-full h-10 px-3 pr-8 appearance-none rounded-xl bg-[#23232b] border border-[#353437] text-[13px] text-[#e5e1e4] focus:outline-none focus:border-[#d0bcff]/50"
        >
          <option value="all">All</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </select>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[#958ea0] pointer-events-none text-[20px]">expand_more</span>
      </div>
    </div>
  )
}
