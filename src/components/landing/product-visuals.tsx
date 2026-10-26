import type { CSSProperties } from "react"
import {
  BadgeCheck,
  CalendarDays,
  Camera,
  CircleCheck,
  CreditCard,
  LayoutDashboard,
  Package,
  ShoppingBag,
  TriangleAlert,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { QrCode } from "./qr-code"
import styles from "./landing.module.css"

// Demo data for "Larian Pelikat 2026". Totals agree with each other:
// weekly registrations and category splits both sum to 2,400, and revenue
// is 820 × RM45 + 910 × RM60 + 670 × RM90 = RM151,800.
const WEEKS = [120, 180, 260, 310, 420, 380, 450, 280]
const CATEGORIES = [
  { name: "5K", count: 820 },
  { name: "10K", count: 910 },
  { name: "21K", count: 670 },
]
const RECENT = [
  { name: "Nurul Aina binti Hassan", cat: "21K", method: "DuitNow QR", status: "Paid" },
  { name: "Lim Wei Jie", cat: "10K", method: "Card", status: "Paid" },
  { name: "Siti Mariam Yusof", cat: "5K", method: "FPX", status: "Paid" },
  { name: "Arjun Pillai", cat: "21K", method: "Complimentary", status: "Waived" },
]
const NAV = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: CalendarDays, label: "Events" },
  { icon: Users, label: "Registrations" },
  { icon: Package, label: "Kit collection" },
  { icon: Camera, label: "Photos" },
  { icon: CreditCard, label: "Payments" },
  { icon: ShoppingBag, label: "Merch" },
]

export function DashboardWindow({ className }: { className?: string }) {
  const max = Math.max(...WEEKS)
  return (
    <div className={cn(styles.window, "text-[13px]", className)} aria-hidden="true">
      <div className={styles.windowBar}>
        <span className={styles.windowDot} />
        <span className={styles.windowDot} />
        <span className={styles.windowDot} />
        <span className="ml-3 truncate text-[12px] text-[var(--muted)]">Organizer · Larian Pelikat 2026</span>
      </div>
      <div className="grid grid-cols-[168px_1fr]">
        <aside className="border-r border-[var(--line)] bg-[var(--surface-2)] p-3">
          <ul className="grid gap-0.5">
            {NAV.map(({ icon: Icon, label, active }) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2",
                  active ? "bg-[var(--surface)] font-medium shadow-[var(--shadow-sm)]" : "text-[var(--muted)]",
                )}
              >
                <Icon className={cn("size-4", active && "text-[var(--accent)]")} />
                {label}
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[17px] font-semibold tracking-tight">Larian Pelikat 2026</p>
              <p className="text-[12px] text-[var(--muted)]">Sun 14 Feb 2027 · Dataran Merdeka, Kuala Lumpur</p>
            </div>
            <span className={cn(styles.pill, styles.pillOk)}>
              <span className="size-1.5 rounded-full bg-current" /> Published
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className={cn(styles.inset, "p-3")}>
              <p className="text-[12px] text-[var(--muted)]">Registrations</p>
              <p className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">2,400</p>
              <p className="text-[11px] text-[var(--ok)]">+280 this week</p>
            </div>
            <div className={cn(styles.inset, "p-3")}>
              <p className="text-[12px] text-[var(--muted)]">Revenue</p>
              <p className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">RM151,800</p>
              <p className="text-[11px] text-[var(--muted)]">via HitPay</p>
            </div>
            <div className={cn(styles.inset, "p-3")}>
              <p className="text-[12px] text-[var(--muted)]">Kits collected</p>
              <p className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">1,284</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div className="h-full w-[53.5%] rounded-full bg-[var(--accent)]" />
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-3">
            <div className={cn(styles.inset, "p-3")}>
              <div className="flex items-baseline justify-between">
                <p className="font-medium">Registrations per week</p>
                <p className="text-[11px] text-[var(--muted)]">8 weeks</p>
              </div>
              <div className={cn(styles.bars, "mt-3 h-[92px]")}>
                {WEEKS.map((w, i) => (
                  <div
                    key={i}
                    className={styles.bar}
                    style={{ height: `${(w / max) * 100}%`, "--i": i } as CSSProperties}
                  />
                ))}
              </div>
            </div>
            <div className={cn(styles.inset, "p-3")}>
              <p className="font-medium">By category</p>
              <ul className="mt-3 grid gap-2.5">
                {CATEGORIES.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between text-[12px]">
                      <span>{c.name}</span>
                      <span className="tabular-nums text-[var(--muted)]">{c.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(c.count / 910) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={cn(styles.inset, "mt-3 overflow-hidden")}>
            <p className="px-3 pt-3 font-medium">Latest registrations</p>
            <ul className="mt-2">
              {RECENT.map((r) => (
                <li key={r.name} className="grid grid-cols-[1fr_44px_110px_64px] items-center gap-2 border-t border-[var(--line)] px-3 py-2">
                  <span className="truncate">{r.name}</span>
                  <span className="text-[var(--muted)]">{r.cat}</span>
                  <span className="truncate text-[var(--muted)]">{r.method}</span>
                  <span className={cn(styles.pill, r.status === "Paid" ? styles.pillOk : styles.pillMuted, "justify-self-end")}>
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(styles.phone, className)} aria-hidden="true">
      <div className={styles.phoneScreen}>
        <span className={styles.phoneNotch} />
        {children}
      </div>
    </div>
  )
}

export function ScannerScreen() {
  return (
    <div className="px-4 pb-5 pt-12 text-[13px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-semibold tracking-tight">Kit collection</p>
          <p className="text-[11px] text-[var(--muted)]">Larian Pelikat 2026</p>
        </div>
        <span className={cn(styles.pill, styles.pillAccent)}>Counter 3</span>
      </div>

      <div className={cn(styles.scanFrame, "mt-4 grid aspect-square place-items-center")}>
        <div className="size-[62%] rounded-lg bg-white p-2 text-[oklch(0.12_0_0)]">
          <QrCode value="PELIKAT-REPC:21K-0457" label="Runner QR key" />
        </div>
        <span className={styles.scanLine} />
        {(["left-3 top-3 border-l-2 border-t-2", "right-3 top-3 border-r-2 border-t-2", "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"] as const).map((pos) => (
          <span key={pos} className={cn("absolute size-6 rounded-[4px] border-[oklch(0.8_0.13_190)]", pos)} />
        ))}
      </div>

      <div className={cn(styles.panel, "mt-3 p-3")}>
        <div className="flex items-center justify-between">
          <p className="text-[18px] font-bold tracking-tight tabular-nums">21K-0457</p>
          <span className={cn(styles.pill, styles.pillOk)}>Paid</span>
        </div>
        <p className="mt-0.5 font-medium">Nurul Aina binti Hassan</p>
        <p className="text-[11px] text-[var(--muted)]">21K Half Marathon · Shirt M</p>
      </div>
      <div className={cn(styles.btn, styles.btnPrimary, "mt-3 w-full")} style={{ minHeight: 44, fontSize: 14 }}>
        Hand over kit
      </div>
    </div>
  )
}

export function PaymentChip({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn(styles.chip, "flex items-center gap-3 p-3 pr-4", className)} style={style} aria-hidden="true">
      <span className={cn(styles.iconTile, "size-9")} style={{ background: "color-mix(in oklch, var(--ok) 16%, transparent)", color: "var(--ok)", boxShadow: "none", borderRadius: 10 }}>
        <CircleCheck className="size-[18px]" />
      </span>
      <div className="text-[13px] leading-tight">
        <p className="font-semibold">Payment received</p>
        <p className="text-[var(--muted)]">RM90.00 · DuitNow QR · Bib 21K-0457</p>
      </div>
    </div>
  )
}

export function DuplicateChip({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn(styles.chip, "flex items-center gap-3 p-3 pr-4", className)} style={style} aria-hidden="true">
      <span className={cn(styles.iconTile, "size-9")} style={{ background: "color-mix(in oklch, var(--warn) 16%, transparent)", color: "var(--warn)", boxShadow: "none", borderRadius: 10 }}>
        <TriangleAlert className="size-[18px]" />
      </span>
      <div className="text-[13px] leading-tight">
        <p className="font-semibold">Duplicate flagged</p>
        <p className="text-[var(--muted)]">5K-0342 already collected at 07:15</p>
      </div>
    </div>
  )
}

export function CertificateCard({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={cn(styles.chip, "w-[270px] p-4", className)} style={style} aria-hidden="true">
      <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span className="font-semibold text-[var(--ink)]">Pelikat Batik</span>
        <span>E-certificate</span>
      </div>
      <div className="mt-3 h-1 w-10 rounded-full bg-[var(--accent)]" />
      <p className="mt-3 text-[11px] text-[var(--muted)]">This certifies that</p>
      <p className="text-[17px] font-semibold leading-tight tracking-tight">Nurul Aina binti Hassan</p>
      <p className="mt-1 text-[12px] text-[var(--muted)]">completed Larian Pelikat 2026</p>
      <div className="mt-3 flex items-center justify-between">
        <span className={cn(styles.pill, styles.pillAccent)}>
          <BadgeCheck className="size-3.5" /> Half Marathon Finisher
        </span>
        <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--muted)]">21K-0457</span>
      </div>
    </div>
  )
}
