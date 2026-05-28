'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PhotoBatchOption {
  id: string
  label: string
  count: number
}

interface PhotoBatchFilterProps {
  batches: PhotoBatchOption[]
  selectedBatchId: string | null
}

export function PhotoBatchFilter({
  batches,
  selectedBatchId,
}: PhotoBatchFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleChange = (value: string) => {
    const nextParams = new URLSearchParams(searchParams.toString())

    nextParams.delete('reviewPage')
    nextParams.delete('galleryPage')
    nextParams.delete('rejectedPage')

    if (value === 'all') {
      nextParams.delete('batchId')
    } else {
      nextParams.set('batchId', value)
    }

    const query = nextParams.toString()
    router.push(query ? `?${query}` : '?')
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div>
        <p className="text-sm font-medium">Batch</p>
        <p className="text-xs text-muted-foreground">Filter processed photo tags</p>
      </div>
      <Select value={selectedBatchId ?? 'all'} onValueChange={handleChange}>
        <SelectTrigger size="sm" className="w-full sm:w-[260px]">
          <SelectValue placeholder="Choose batch" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All batches</SelectItem>
          {batches.map((batch) => (
            <SelectItem key={batch.id} value={batch.id}>
              {batch.label} ({batch.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
