import type { LucideIcon } from "lucide-react"
import { BadgeCheck, Camera, CircleCheck, Gift, Package, Route, ShoppingBag, TriangleAlert, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

type Tone = "accent" | "ok" | "warn"
type Item = { icon: LucideIcon; tone: Tone; text: string; detail: string }

// Illustrative race-morning activity for the demo event.
const ROW_A: Item[] = [
  { icon: Package, tone: "accent", text: "21K-0457 kit collected", detail: "Counter 3" },
  { icon: CircleCheck, tone: "ok", text: "RM60.00 received", detail: "FPX · 10K" },
  { icon: Camera, tone: "accent", text: "Bib 79 · 3 photos matched", detail: "km 14" },
  { icon: TriangleAlert, tone: "warn", text: "Duplicate flagged", detail: "5K-0342" },
  { icon: BadgeCheck, tone: "accent", text: "Certificate issued", detail: "Half Marathon Finisher" },
  { icon: CircleCheck, tone: "ok", text: "RM90.00 received", detail: "DuitNow QR · 21K" },
]
const ROW_B: Item[] = [
  { icon: Route, tone: "accent", text: "Virtual 10K logged", detail: "10.0 km by GPS" },
  { icon: Gift, tone: "ok", text: "Complimentary entry added", detail: "Pacer team" },
  { icon: ShoppingBag, tone: "accent", text: "Merch order", detail: "Finisher tee · M" },
  { icon: UserCheck, tone: "ok", text: "Checked in", detail: "21K-0611" },
  { icon: Package, tone: "accent", text: "10K-1188 kit collected", detail: "Counter 1" },
  { icon: CircleCheck, tone: "ok", text: "RM45.00 received", detail: "Card · 5K" },
]

const toneStyle: Record<Tone, React.CSSProperties> = {
  accent: { background: "var(--accent-soft)", color: "var(--accent)" },
  ok: { background: "color-mix(in oklch, var(--ok) 16%, transparent)", color: "var(--ok)" },
  warn: { background: "color-mix(in oklch, var(--warn) 18%, transparent)", color: "var(--warn)" },
}

function Row({ items, reverse }: { items: Item[]; reverse?: boolean }) {
  // Rendered twice so the -50% translate loops without a seam.
  const loop = [...items, ...items]
  return (
    <div className={styles.ticker}>
      <ul className={cn(styles.tickerTrack, reverse && styles.tickerReverse)}>
        {loop.map(({ icon: Icon, tone, text, detail }, i) => (
          <li key={i} className={styles.tickerItem} aria-hidden={i >= items.length}>
            <span className={styles.tickerIcon} style={toneStyle[tone]}>
              <Icon className="size-3.5" />
            </span>
            <span className="font-medium">{text}</span>
            <span className="text-[var(--muted)]">{detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ActivityTicker() {
  return (
    <section aria-label="Example race-morning activity" className="py-6 sm:py-10">
      <p className="mb-5 text-center text-[13px] text-[var(--muted)]">What race morning looks like on Pelikat</p>
      <div className="grid gap-3">
        <Row items={ROW_A} />
        <Row items={ROW_B} reverse />
      </div>
    </section>
  )
}
