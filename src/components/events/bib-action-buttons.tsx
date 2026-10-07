'use client'

export function BibActionButtons({ bibNumber, eventName }: { bibNumber: string; eventName: string }) {
  const handleSave = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 240
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#131315'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#cbc3d7'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('BIB NUMBER', canvas.width / 2, 40)

    ctx.fillStyle = '#e5e1e4'
    ctx.font = 'bold 48px monospace'
    ctx.fillText(bibNumber, canvas.width / 2, 110)

    ctx.fillStyle = '#958ea0'
    ctx.font = '18px system-ui'
    ctx.fillText(eventName, canvas.width / 2, 150)

    const link = document.createElement('a')
    link.download = `BIB-${bibNumber}-${eventName.replace(/\s+/g, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `BIB ${bibNumber} - ${eventName}`,
          text: `Check out my digital BIB ${bibNumber} for ${eventName}!`,
          url: window.location.href,
        })
      } catch {}
    } else {
      await navigator.clipboard.writeText(window.location.href)
      alert('Link copied to clipboard!')
    }
  }

  return (
    <div className="flex w-full gap-2 mt-4">
      <button 
        onClick={handleSave}
        className="flex-1 py-3 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[18px]">download</span>
        Save Image
      </button>
      <button 
        onClick={handleShare}
        className="flex-1 py-3 rounded-xl bg-[#2a2a2c] text-[#e5e1e4] text-[13px] font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[18px]">share</span>
        Share
      </button>
    </div>
  )
}
