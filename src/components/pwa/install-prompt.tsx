'use client'

export function PWAInstallPrompt() {
  return (
    <div className="min-h-screen bg-[#0e0e10] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-[#131315] rounded-3xl border border-[#23232b] p-8 shadow-2xl flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-[#d0bcff]/10 rounded-2xl flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-[40px] text-[#d0bcff]">install_mobile</span>
        </div>
        
        <h1 className="text-[24px] font-bold text-[#e5e1e4] mb-3 tracking-tight">
          Install Pelikat Runner
        </h1>
        
        <p className="text-[14px] text-[#958ea0] mb-8 leading-relaxed">
          The Runner experience is designed exclusively as a mobile app. 
          Please install this app on your device to access your digital bibs, 
          event discovery, and ticket wallet.
        </p>

        <div className="w-full bg-[#1c1b1d] rounded-2xl border border-[#353437] p-5 mb-8 text-left">
          <h3 className="text-[12px] font-bold text-[#cbc3d7] uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#4cd7f6]">phone_iphone</span>
            iOS (Safari)
          </h3>
          <ol className="text-[13px] text-[#958ea0] space-y-3">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[#2a2a2c] text-[#e5e1e4] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
              <span>Tap the <strong className="text-[#e5e1e4]">Share</strong> button at the bottom of the screen.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[#2a2a2c] text-[#e5e1e4] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
              <span>Scroll down and tap <strong className="text-[#e5e1e4]">Add to Home Screen</strong>.</span>
            </li>
          </ol>
        </div>

        <div className="w-full bg-[#1c1b1d] rounded-2xl border border-[#353437] p-5 text-left">
          <h3 className="text-[12px] font-bold text-[#cbc3d7] uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#4edea3]">android</span>
            Android (Chrome)
          </h3>
          <ol className="text-[13px] text-[#958ea0] space-y-3">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[#2a2a2c] text-[#e5e1e4] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
              <span>Tap the <strong className="text-[#e5e1e4]">Menu</strong> icon (three dots) in the top right.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-[#2a2a2c] text-[#e5e1e4] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
              <span>Tap <strong className="text-[#e5e1e4]">Install app</strong> or <strong className="text-[#e5e1e4]">Add to Home screen</strong>.</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
