'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface BucketUsage {
  name: string
  size: number
  fileCount: number
}

interface StorageResponse {
  buckets: BucketUsage[]
  totalSize: number
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function StorageUsage() {
  const [loading, setLoading] = useState(true)
  const [buckets, setBuckets] = useState<BucketUsage[]>([])
  const [totalSize, setTotalSize] = useState(0)

  useEffect(() => {
    async function fetchStorageUsage() {
      try {
        const res = await fetch('/api/admin/storage')
        if (!res.ok) {
          setLoading(false)
          return
        }
        const data: StorageResponse = await res.json()
        setBuckets(data.buckets)
        setTotalSize(data.totalSize)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchStorageUsage()
  }, [])

  const maxBucketSize = Math.max(...buckets.map((b) => b.size), 1)

  // Bucket color mapping
  const bucketColors = ['bg-[#d0bcff]', 'bg-[#4cd7f6]', 'bg-[#4edea3]', 'bg-[#ffb4ab]']

  return (
    <div className="rounded-xl bg-[#1c1b1d] p-5 shadow-md border border-[#494454]/30 flex flex-col gap-4 font-inter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#d0bcff] text-[20px]">hard_drive</span>
          <h3 className="font-semibold text-[#e5e1e4] text-[15px] font-jakarta">Storage Usage</h3>
        </div>
        <span className="text-[11px] text-[#958ea0] font-mono">
          {formatBytes(totalSize)} total
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-[#d0bcff]" />
        </div>
      ) : buckets.length === 0 ? (
        <p className="text-[13px] text-[#958ea0] py-4 text-center">No storage buckets found</p>
      ) : (
        <div className="flex flex-col gap-3">
          {buckets.map((bucket, i) => {
            const pct = Math.round((bucket.size / maxBucketSize) * 100)
            const color = bucketColors[i % bucketColors.length]
            return (
              <div key={bucket.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-[#e5e1e4] font-inter">{bucket.name}</span>
                  <span className="text-[#958ea0] font-mono">
                    {formatBytes(bucket.size)} · {bucket.fileCount} files
                  </span>
                </div>
                <div className="w-full bg-[#353437] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${color} h-1.5 rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
          <p className="text-[10px] text-[#494454] font-inter pt-1">
            {buckets.length} bucket{buckets.length !== 1 ? 's' : ''} · AWS ap-southeast-1
          </p>
        </div>
      )}
    </div>
  )
}
