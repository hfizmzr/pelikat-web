'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

export function ExportCSV({
  eventId,
  gender,
}: {
  eventId?: string
  gender?: string
}) {
  const handleExport = async () => {
    const res = await fetch('/api/leaderboard/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, gender }),
    })

    if (!res.ok) return

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leaderboard-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  )
}
