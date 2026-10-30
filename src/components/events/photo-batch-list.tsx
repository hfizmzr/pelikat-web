'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'
import {
  PHOTO_BATCH_COLUMNS,
  RECENT_PHOTO_BATCH_LIMIT,
  isPhotoBatchActive,
  type PhotoBatch,
} from '@/lib/photo-batches'

const POLL_MS = 3000

interface PhotoBatchListProps {
  eventId: string
  initialBatches: PhotoBatch[]
}

function formatBatchTime(value: string) {
  return new Date(value).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function BatchStatusBadge({ batch }: { batch: PhotoBatch }) {
  if (batch.status === 'completed') {
    return <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-400">Completed</Badge>
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      {batch.status === 'queued' ? 'Queued' : 'Processing'}
    </Badge>
  )
}

const STATS: { key: 'auto_tagged' | 'flagged' | 'no_bib' | 'failed'; label: string; className: string }[] = [
  { key: 'auto_tagged', label: 'Auto-tagged', className: 'text-green-600' },
  { key: 'flagged', label: 'Flagged', className: 'text-amber-600' },
  { key: 'no_bib', label: 'No BIB found', className: '' },
  { key: 'failed', label: 'Failed', className: 'text-destructive' },
]

/**
 * Per-batch processing status and stats (FR-20). Polls photo_batches while
 * any batch is still queued/processing, and refreshes the page when one
 * finishes so the review queue and gallery pick up the new tags.
 */
export function PhotoBatchList({ eventId, initialBatches }: PhotoBatchListProps) {
  const router = useRouter()
  // Polled rows are only trusted until the server sends fresh props.
  const [polled, setPolled] = useState<{ from: PhotoBatch[]; rows: PhotoBatch[] } | null>(null)
  const batches = polled && polled.from === initialBatches ? polled.rows : initialBatches
  const hasActive = batches.some(isPhotoBatchActive)

  useEffect(() => {
    if (!hasActive) return

    const supabase = createClient()
    let activeIds = new Set(initialBatches.filter(isPhotoBatchActive).map((batch) => batch.id))
    let cancelled = false

    const poll = async () => {
      if (document.hidden) return
      const { data, error } = await supabase
        .from('photo_batches')
        .select(PHOTO_BATCH_COLUMNS)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(RECENT_PHOTO_BATCH_LIMIT)

      if (cancelled || error || !data) return
      const rows = data as PhotoBatch[]
      setPolled({ from: initialBatches, rows })

      const finished = rows.some((batch) => activeIds.has(batch.id) && !isPhotoBatchActive(batch))
      activeIds = new Set(rows.filter(isPhotoBatchActive).map((batch) => batch.id))
      if (finished) router.refresh()
    }

    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [eventId, initialBatches, hasActive, router])

  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No processing batches yet. Uploaded photos are tagged automatically in the background.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {batches.map((batch) => {
        const percent = batch.total > 0 ? Math.round((batch.processed / batch.total) * 100) : 0
        return (
          <li key={batch.id} className="rounded-md border border-border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {batch.source === 'reprocess' ? 'Reprocess' : 'Upload'} · {formatBatchTime(batch.created_at)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {batch.processed} of {batch.total} photo{batch.total !== 1 ? 's' : ''} processed · Batch {batch.id.slice(0, 8)}
                </p>
              </div>
              <BatchStatusBadge batch={batch} />
            </div>
            {isPhotoBatchActive(batch) && <Progress value={percent} className="h-2" />}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.key} className="rounded-md bg-muted/40 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className={`text-base font-semibold ${stat.className}`}>{batch[stat.key]}</dd>
                </div>
              ))}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
