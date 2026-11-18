import type { LucideIcon } from "lucide-react"
import { BadgeCheck, Package, TriangleAlert, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

type Item = { time: string; icon: LucideIcon; warn?: boolean; text: string; detail: string }

// Illustrative race-morning activity for the demo event, in time order.
const LOG: Item[] = [
  { time: "06:58", icon: UserCheck, text: "Checked in", detail: "21K-0611 at the start pen" },
  { time: "07:15", icon: TriangleAlert, warn: true, text: "Duplicate flagged", detail: "5K-0342 at Counter 2" },
  { time: "07:42", icon: Package, text: "Kit collected", detail: "21K-0457 at Counter 3" },
  { time: "10:05", icon: BadgeCheck, text: "Certificate issued", detail: "Half Marathon Finisher" },
]

export function ActivityTicker() {
  return (
    <section aria-labelledby="race-morning-title" className="py-8 sm:py-12">
      <div className={styles.container}>
        <h2 id="race-morning-title" className="text-[14px] text-[var(--muted)]">
          Race day on Pelikat, as it happens
        </h2>
        <ol className={cn(styles.card, "mt-4 grid gap-px overflow-hidden bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4")}>
          {LOG.map(({ time, icon: Icon, warn, text, detail }) => (
            <li key={time} className="flex gap-3 bg-[var(--surface)] p-4">
              <span className={cn(styles.bibNo, "pt-px text-[12px] text-[var(--muted)]")}>{time}</span>
              <div className="min-w-0 text-[14px]">
                <p className="flex items-center gap-2 font-medium">
                  <Icon className={cn("size-4 shrink-0", warn ? "text-[var(--warn)]" : "text-[var(--muted)]")} strokeWidth={1.75} aria-hidden="true" />
                  {text}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
