'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loader2, HardDrive } from 'lucide-react'

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
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
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

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Usage
          </CardTitle>
          <CardDescription>Loading storage information...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Storage Usage
        </CardTitle>
        <CardDescription>
          Total: {formatBytes(totalSize)} across {buckets.length} bucket(s)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No storage buckets found</p>
        ) : (
          <div className="space-y-4">
            {buckets.map((bucket) => (
              <div key={bucket.name} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{bucket.name}</span>
                  <span className="text-muted-foreground">
                    {formatBytes(bucket.size)} ({bucket.fileCount} files)
                  </span>
                </div>
                <Progress
                  value={(bucket.size / maxBucketSize) * 100}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
