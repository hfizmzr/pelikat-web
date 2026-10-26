import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { BadgeCheck, Camera, CreditCard, Lock, Package, Route, Search, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { QrCode } from "./qr-code"
import { CertificateCard, PaymentChip } from "./product-visuals"
import styles from "./landing.module.css"

function Feature({
  icon,
  title,
  children,
  visual,
  className,
  i,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
  visual: ReactNode
  className?: string
  i: number
}) {
  return (
    <article
      className={cn(styles.card, styles.cardInteractive, styles.spot, "flex flex-col overflow-hidden", className)}
      data-reveal=""
      data-spotlight=""
      style={{ "--i": i } as CSSProperties}
    >
      <div className="relative h-[220px] overflow-hidden border-b border-[var(--line)] bg-[var(--surface-2)]" aria-hidden="true">
        {visual}
      </div>
      <div className="flex gap-4 p-6">
        <span className={styles.iconTile}>{icon}</span>
        <div>
          <h3 className={styles.h3}>{title}</h3>
          <p className={cn(styles.body, "mt-1.5")}>{children}</p>
        </div>
      </div>
    </article>
  )
}

const scans = [
  { bib: "21K-0457", name: "Nurul Aina", note: "Collected 07:42", tone: "ok" },
  { bib: "10K-1188", name: "Lim Wei Jie", note: "Collected 07:43", tone: "ok" },
  { bib: "5K-0342", name: "Priya Nair", note: "Already collected", tone: "warn" },
  { bib: "21K-0611", name: "Hafiz Rahman", note: "Ready", tone: "muted" },
] as const

export function FeaturesBento() {
  return (
    <section id="features" className={styles.section} aria-labelledby="features-title">
      <div className={styles.container}>
        <div className="mx-auto max-w-2xl text-center" data-reveal="">
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Platform
          </span>
          <h2 id="features-title" className={cn(styles.h2, "mt-5")}>
            Everything race day runs on
          </h2>
          <p className={cn(styles.lead, "mt-4")}>
            One system from the first entry to the last certificate, so nothing
            lives in spreadsheets or group chats.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Feature
            i={0}
            className="md:col-span-2"
            icon={<CreditCard className="size-5" />}
            title="Registration and payments"
            visual={
              <div className="absolute inset-0 flex items-center justify-center gap-6 px-6">
                <div className={cn(styles.panel, "flex max-w-full shrink-0 items-center gap-4 p-4")}>
                  <div className="size-[88px] shrink-0 rounded-lg bg-white p-1.5 text-[oklch(0.12_0_0)]">
                    <QrCode value="DEMO-DUITNOW:LARIAN-PELIKAT-2026:RM90.00" label="Sample DuitNow QR" />
                  </div>
                  <div className="min-w-0 text-[13px]">
                    <p className="text-[var(--muted)]">Larian Pelikat 2026 · 21K</p>
                    <p className="text-[24px] font-bold tracking-tight tabular-nums">RM90.00</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className={cn(styles.pill, styles.pillAccent)}>DuitNow QR</span>
                      <span className={cn(styles.pill, styles.pillMuted)}>FPX</span>
                      <span className={cn(styles.pill, styles.pillMuted)}>Card</span>
                    </div>
                  </div>
                </div>
                <PaymentChip className={cn(styles.float, "hidden w-max sm:flex")} />
              </div>
            }
          >
            Set categories and prices per event. Runners pay by DuitNow QR,
            FPX or card through HitPay, and confirmations land automatically.
          </Feature>

          <Feature
            i={1}
            icon={<Package className="size-5" />}
            title="QR kit collection"
            visual={
              <ul className="absolute inset-x-5 top-5 grid gap-2">
                {scans.map((s) => (
                  <li key={s.bib} className={cn(styles.panel, "flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]")}>
                    <span>
                      <span className="font-semibold tabular-nums">{s.bib}</span>
                      <span className="text-[var(--muted)]"> · {s.name}</span>
                    </span>
                    <span className={cn(styles.pill, s.tone === "ok" ? styles.pillOk : s.tone === "warn" ? styles.pillWarn : styles.pillMuted)}>
                      {s.note}
                    </span>
                  </li>
                ))}
              </ul>
            }
          >
            Every entry gets its own QR key. Scan it at the counter from any phone;
            duplicates are flagged before a kit goes out twice.
          </Feature>

          <Feature
            i={2}
            icon={<Camera className="size-5" />}
            title="Race photos by bib"
            visual={
              <>
                <div className={cn(styles.chip, "absolute left-5 top-5 z-10 flex items-center gap-2 px-3 py-2 text-[13px]")}>
                  <Search className="size-4 text-[var(--muted)]" />
                  Bib <span className="font-semibold">79</span>
                  <span className="text-[var(--muted)]">· 3 photos</span>
                </div>
                <div className={styles.photoCard} style={{ right: "6%", top: "14%", transform: "rotate(6deg)" }}>
                  <Image src="/images/landing/cardiff-half-marathon-runners-geograph-org-uk.jpg" alt="" fill sizes="240px" className="object-cover" />
                </div>
                <div className={styles.photoCard} style={{ right: "22%", top: "26%", transform: "rotate(-4deg)" }}>
                  <Image src="/images/landing/runners-of-the-vivawest-marathon-2022-during.jpg" alt="" fill sizes="240px" className="object-cover" />
                </div>
                <div className={styles.photoCard} style={{ left: "8%", top: "34%", transform: "rotate(-1deg)" }}>
                  <Image src="/images/landing/omagh-half-marathon-runners-2-geograph-org.jpg" alt="" fill sizes="240px" className="object-cover" />
                </div>
              </>
            }
          >
            Upload the photographers&apos; sets. Runners type their bib number and
            find their own shots instead of scrolling a gallery.
          </Feature>

          <Feature
            i={3}
            icon={<BadgeCheck className="size-5" />}
            title="Badges and e-certificates"
            visual={
              <div className="absolute inset-0 grid place-items-center">
                <CertificateCard className="rotate-[-3deg]" />
              </div>
            }
          >
            Finishers earn badges, and every badge issues a certificate with the
            runner&apos;s name, event and bib, ready to download.
          </Feature>

          <Feature
            i={4}
            icon={<Route className="size-5" />}
            title="Virtual runs"
            visual={
              <div className="absolute inset-0">
                <svg viewBox="0 0 320 220" className="absolute inset-0 size-full" fill="none">
                  <defs>
                    <linearGradient id="routeStroke" x1="0" x2="1">
                      <stop offset="0" stopColor="var(--accent)" stopOpacity="0.25" />
                      <stop offset="1" stopColor="var(--accent)" />
                    </linearGradient>
                  </defs>
                  <path
                    className={styles.route}
                    d="M30 170 C 70 120, 60 70, 110 70 S 170 140, 210 120 S 250 40, 290 52"
                    stroke="url(#routeStroke)"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <circle cx="30" cy="170" r="7" fill="var(--surface)" stroke="var(--accent)" strokeWidth="3" />
                  <circle cx="290" cy="52" r="9" fill="var(--accent)" />
                  <circle cx="290" cy="52" r="16" fill="var(--accent)" opacity="0.2" />
                </svg>
                <div className={cn(styles.chip, "absolute bottom-5 left-5 px-3 py-2 text-[13px]")}>
                  <p className="font-semibold tabular-nums">21.1 km of 21.1 km</p>
                  <p className="text-[var(--muted)]">Logged by GPS · target reached</p>
                </div>
              </div>
            }
          >
            Run a virtual event with a target distance. Runners log it by GPS on
            their phone and the badge follows.
          </Feature>

          <article
            className={cn(styles.card, styles.spot, "grid items-center gap-8 overflow-hidden p-6 md:col-span-2 md:grid-cols-[1fr_1.1fr] md:p-8 lg:col-span-3")}
            data-reveal=""
            data-spotlight=""
            style={{ "--i": 5 } as CSSProperties}
          >
            <div className="flex gap-4">
              <span className={styles.iconTile}>
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <h3 className={styles.h3}>Runner data, handled properly</h3>
                <p className={cn(styles.body, "mt-1.5 max-w-[48ch]")}>
                  IC and passport documents are encrypted, runners give PDPA
                  consent before uploading, and organizers see masked identity
                  details instead of the documents themselves.
                </p>
              </div>
            </div>
            <div className={cn(styles.inset, "grid gap-2 p-3 text-[13px]")} aria-hidden="true">
              {[
                ["Runner", "Nurul Aina binti Hassan", null],
                ["IC number", "980214-••-••21", "Encrypted"],
                ["PDPA consent", "Given 3 Jan 2027", "Recorded"],
              ].map(([k, v, tag]) => (
                <div key={k} className={cn(styles.panel, "flex items-center justify-between gap-3 px-3 py-2.5")}>
                  <span className="text-[var(--muted)]">{k}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{v}</span>
                    {tag && (
                      <span className={cn(styles.pill, styles.pillAccent)}>
                        <Lock className="size-3" /> {tag}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
