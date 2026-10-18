'use client'
import { Smartphone } from "lucide-react"

export function PWAInstallPrompt() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-background rounded-3xl border border-muted p-8 shadow-2xl flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
          <Smartphone className="size-[40px] text-primary" />
        </div>
        
        <h1 className="text-[24px] font-bold text-foreground mb-3 tracking-tight">
          Install Pelikat Runner
        </h1>
        
        <p className="text-[14px] text-muted-foreground mb-8 leading-relaxed">
          The Runner experience is designed exclusively as a mobile app. 
          Please install this app on your device to access your digital bibs, 
          event discovery, and ticket wallet.
        </p>

        <div className="w-full bg-card rounded-2xl border border-border p-5 mb-8 text-left">
          <h3 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Smartphone className="size-[16px] text-primary" />
            iOS (Safari)
          </h3>
          <ol className="text-[13px] text-muted-foreground space-y-3">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-accent text-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
              <span>Tap the <strong className="text-foreground">Share</strong> button at the bottom of the screen.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-accent text-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
              <span>Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong>.</span>
            </li>
          </ol>
        </div>

        <div className="w-full bg-card rounded-2xl border border-border p-5 text-left">
          <h3 className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Smartphone className="size-[16px] text-success" />
            Android (Chrome)
          </h3>
          <ol className="text-[13px] text-muted-foreground space-y-3">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-accent text-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
              <span>Tap the <strong className="text-foreground">Menu</strong> icon (three dots) in the top right.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-accent text-foreground flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
              <span>Tap <strong className="text-foreground">Install app</strong> or <strong className="text-foreground">Add to Home screen</strong>.</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
