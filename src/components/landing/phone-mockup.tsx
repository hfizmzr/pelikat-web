import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PhoneMockupProps {
  children: ReactNode
  className?: string
}

export function PhoneMockup({ children, className }: PhoneMockupProps) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[300px] rounded-[2.5rem] border-[8px] border-secondary bg-background p-2 shadow-2xl",
        className
      )}
    >
      {/* Notch */}
      <div className="absolute left-1/2 top-0 z-10 h-6 w-24 -translate-x-1/2 rounded-b-xl bg-secondary" />
      
      {/* Screen */}
      <div className="relative overflow-hidden rounded-[2rem] bg-card">
        {children}
      </div>
    </div>
  )
}
