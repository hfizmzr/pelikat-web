import Image from "next/image"
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
      <p className="text-[15px] font-medium">My race</p>
      <div className={cn(styles.bib, "mt-3")}>
        {(["left-2 top-2", "right-2 top-2", "bottom-2 left-2", "bottom-2 right-2"] as const).map((pos) => (
          <span key={pos} className={cn(styles.bibPin, pos)} />
        ))}
        <div className={cn(styles.bibBand, "px-4 py-2 text-[11px]")}>Larian Pelikat 2026 · 21K</div>
        <div className="px-4 pb-2 pt-3 text-center">
          <p className={cn(styles.bibNo, "text-[36px] font-medium leading-none")}>21K-0457</p>
          <p className="mt-2 text-[12px] opacity-70">Nurul Aina binti Hassan</p>
        </div>
        <div className="flex items-center gap-3 border-t border-dashed border-[oklch(0.2_0.01_240/0.15)] px-4 py-3">
          <div className="size-[64px] shrink-0 text-[oklch(0.12_0_0)]">
            <QrCode value="PELIKAT-REPC:21K-0457" label="Kit collection QR" />
          </div>
          <p className="text-[12px] leading-snug opacity-70">Show this at kit collection, Counter 1 to 4</p>
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
          <BadgeCheck className="size-4 text-[var(--muted)]" strokeWidth={1.75} /> Certificate ready
        </span>
        <Download className="size-4 text-[var(--muted)]" strokeWidth={1.75} />
      </div>
    </div>
  )
}

export function RunnerApp() {
  return (
    <section id="runners" className={cn(styles.section, "relative overflow-x-clip")} aria-labelledby="runners-title">
      <div className={cn(styles.container, "relative grid items-center gap-14 lg:grid-cols-2")}>
        <div>
          <h2 id="runners-title" className={styles.h2}>
            An app your runners don&apos;t have to download
          </h2>
          <p className={cn(styles.lead, "mt-4 max-w-[46ch]")}>
            Pelikat is a progressive web app. Runners open one link, sign up free
            and keep everything for race day on their phone.
          </p>
          <ul className="mt-8 grid gap-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <Check className="mt-1 size-4 shrink-0 text-[var(--muted)]" strokeWidth={2} aria-hidden="true" />
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className={cn(styles.body, "mt-0.5")}>{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto">
          <PhoneFrame>
            <BibScreen />
          </PhoneFrame>
          <div className={cn(styles.chip, "absolute -left-6 -top-5 flex w-max items-center gap-2.5 px-3 py-2.5 text-[13px] sm:-left-52 sm:top-16")} aria-hidden="true">
            <Smartphone className="size-4 text-[var(--muted)]" strokeWidth={1.75} />
            <span className="font-medium">Added to Home Screen</span>
          </div>
          <CertificateCard className="absolute -bottom-8 -right-6 hidden rotate-[3deg] sm:block sm:-right-24 xl:-right-40" />
        </div>
      </div>
    </section>
  )
}
