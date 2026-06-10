import { supabaseAdmin } from '@/lib/supabase/service-role'
import { NextResponse } from 'next/server'

interface BucketUsage {
  name: string
  size: number
  fileCount: number
}

export async function GET() {
  const { data: bucketsList, error } = await supabaseAdmin.storage.listBuckets()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!bucketsList || bucketsList.length === 0) {
    return NextResponse.json({ buckets: [], totalSize: 0 })
  }

  const buckets: BucketUsage[] = []
  let totalSize = 0

  for (const bucket of bucketsList) {
    const { data: objects } = await supabaseAdmin.storage
      .from(bucket.name)
      .list('', { limit: 1000 })

    const fileCount = objects?.length || 0
    const estimatedSize = fileCount * 500000

    buckets.push({
      name: bucket.name,
      size: estimatedSize,
      fileCount,
    })
    totalSize += estimatedSize
  }

  return NextResponse.json({ buckets, totalSize })
}
