import Image from "next/image"
import type { CSSProperties } from "react"
import { BadgeCheck, Check, Download, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { QrCode } from "./qr-code"
import { CertificateCard, PhoneFrame } from "./product-visuals"
import styles from "./landing.module.css"

const points = [
  { title: "Installs from the browser", body: "Add Pelikat to the home screen and it opens full-screen, like any app. No store, no download page." },
  { title: "Bib and QR key in their pocket", body: "Their bib number and kit-collection QR are one tap away on race morning." },
  { title: "Photos and certificates after the finish", body: "Race photos by bib, badges, e-certificates and a run log, all in one place." },
]

function BibScreen() {
  return (
    <div className="px-4 pb-5 pt-12 text-[13px]">
      <p className="text-[15px] font-semibold tracking-tight">My race</p>
      <div
        className="mt-3 overflow-hidden rounded-2xl text-white"
        style={{ background: "linear-gradient(150deg, oklch(0.55 0.12 190), oklch(0.32 0.07 215))", boxShadow: "0 16px 32px -16px oklch(0.5 0.12 200 / 0.8)" }}
      >
        <div className="p-4">
          <p className="text-[11px] opacity-80">Larian Pelikat 2026 · 21K</p>
          <p className="mt-1 text-[34px] font-bold leading-none tracking-tight tabular-nums">21K-0457</p>
          <p className="mt-1 text-[12px] opacity-85">Nurul Aina binti Hassan</p>
        </div>
        <div className="flex items-center gap-3 bg-white/10 p-3">
          <div className="size-[72px] shrink-0 rounded-lg bg-white p-1.5 text-[oklch(0.12_0_0)]">
            <QrCode value="PELIKAT-REPC:21K-0457" label="Kit collection QR" />
          </div>
          <p className="text-[12px] leading-snug opacity-90">Show this at kit collection, Counter 1–4</p>
        </div>
      </div>

      <div className={cn(styles.panel, "mt-3 p-3")}>
        <div className="flex items-center justify-between">
          <p className="font-medium">Race photos</p>
          <span className="text-[11px] text-[var(--muted)]">3 found</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {[
            "/images/landing/omagh-half-marathon-runners-2-geograph-org.jpg",
            "/images/landing/cardiff-half-marathon-runners-geograph-org-uk.jpg",
            "/images/landing/runners-of-the-vivawest-marathon-2022-during.jpg",
          ].map((src) => (
            <div key={src} className="relative aspect-square overflow-hidden rounded-md">
              <Image src={src} alt="" fill sizes="80px" className="object-cover" />
            </div>
          ))}
        </div>
      </div>

      <div className={cn(styles.panel, "mt-3 flex items-center justify-between p-3")}>
        <span className="flex items-center gap-2 font-medium">
          <BadgeCheck className="size-4 text-[var(--accent)]" /> Certificate ready
        </span>
        <Download className="size-4 text-[var(--muted)]" />
      </div>
    </div>
  )
}

export function RunnerApp() {
  return (
    <section id="runners" className={cn(styles.section, "relative overflow-x-clip")} aria-labelledby="runners-title">
      <div className={cn(styles.container, "relative grid items-center gap-14 lg:grid-cols-2")}>
        <div data-reveal="">
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            For runners
          </span>
          <h2 id="runners-title" className={cn(styles.h2, "mt-5")}>
            An app your runners don&apos;t have to download
          </h2>
          <p className={cn(styles.lead, "mt-4 max-w-[46ch]")}>
            Pelikat is a progressive web app. Runners open one link, sign up free
            and keep everything for race day on their phone.
          </p>
          <ul className="mt-8 grid gap-5">
            {points.map((p, i) => (
              <li key={p.title} className="flex gap-4" data-reveal="" style={{ "--i": i + 1 } as CSSProperties}>
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Check className="size-4" />
                </span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className={cn(styles.body, "mt-0.5")}>{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto" data-reveal="" style={{ "--i": 2 } as CSSProperties}>
          {/* Glow sits behind the phone and fades out on every side. */}
          <div
            className={cn(styles.glow, "-z-10")}
            style={{ left: "50%", top: "50%", width: 600, height: 600, transform: "translate(-50%, -50%)" }}
            aria-hidden="true"
          />
          <PhoneFrame>
            <BibScreen />
          </PhoneFrame>
          <div className={cn(styles.chip, styles.floatSlow, "absolute -left-6 -top-5 flex w-max items-center gap-2.5 px-3 py-2.5 text-[13px] sm:-left-32 sm:top-6")} aria-hidden="true">
            <Smartphone className="size-4 text-[var(--accent)]" />
            <span className="font-medium">Added to Home Screen</span>
          </div>
          <CertificateCard className={cn(styles.float, "absolute -bottom-8 -right-6 hidden rotate-[4deg] sm:block sm:-right-24 xl:-right-40")} />
        </div>
      </div>
    </section>
  )
}
