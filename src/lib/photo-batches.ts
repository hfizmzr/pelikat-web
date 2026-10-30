/** A row of public.photo_batches (migration 087): one upload / reprocess run. */
export type PhotoBatch = {
  id: string
  event_id: string
  source: 'upload' | 'reprocess'
  status: 'queued' | 'processing' | 'completed'
  total: number
  /** photos finished so far, failed ones included */
  processed: number
  auto_tagged: number
  flagged: number
  no_bib: number
  failed: number
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export const PHOTO_BATCH_COLUMNS =
  'id, event_id, source, status, total, processed, auto_tagged, flagged, no_bib, failed, created_at, started_at, finished_at'

/** How many recent batches the photos page shows. */
export const RECENT_PHOTO_BATCH_LIMIT = 10

export function isPhotoBatchActive(batch: Pick<PhotoBatch, 'status'>) {
  return batch.status !== 'completed'
}
