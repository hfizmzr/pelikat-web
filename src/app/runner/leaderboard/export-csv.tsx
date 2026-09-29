'use client'

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
    <button
      onClick={handleExport}
      className="py-2.5 px-3 rounded-xl bg-[#2a2a2c] border border-[#353437] text-[#e5e1e4] text-[13px] font-bold flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
    >
      <span className="material-symbols-outlined text-[18px]">download</span>
      <span className="hidden sm:inline">Export</span>
    </button>
  )
}
