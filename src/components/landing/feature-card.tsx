import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface FeatureCardProps {
  icon?: ReactNode
  title: string
  description: string
  className?: string
  children?: ReactNode
}

export function FeatureCard({
  icon,
  title,
  description,
  className,
  children,
}: FeatureCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  )
}
