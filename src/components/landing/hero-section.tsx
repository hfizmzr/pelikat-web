import Link from "next/link"
import type { CSSProperties } from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { DashboardWindow, DuplicateChip, PaymentChip, PhoneFrame, ScannerScreen } from "./product-visuals"
import styles from "./landing.module.css"

const delay = (i: number) => ({ "--i": i }) as CSSProperties

export function HeroSection({ priceLabel }: { priceLabel: string }) {
  return (
    <section className="relative isolate overflow-x-clip pt-14 sm:pt-20" aria-labelledby="hero-title">
      <div className={styles.bgLayer}>
        <div className={styles.gridBg} />
        <div className={styles.glow} style={{ left: "50%", top: "52%", width: "min(1100px, 150vw)", height: 640, transform: "translateX(-50%)" }} />
      </div>

      <div className={cn(styles.container, "relative z-10 text-center")}>
        <div className={styles.enter} style={delay(0)}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Built for Malaysian running events
          </span>
        </div>
        <h1
          id="hero-title"
          className={cn(styles.h1, styles.enter, "mx-auto mt-6 max-w-[15ch]")}
          style={delay(1)}
        >
          <span className={styles.inkFade}>Run the whole race </span>
          <span className={styles.accentText}>from one place</span>
        </h1>
        <p className={cn(styles.lead, styles.enter, "mx-auto mt-6 max-w-[56ch]")} style={delay(2)}>
          Registration, DuitNow payments, QR kit collection, race photos and
          e-certificates for organizers. Runners get it all in their browser,
          with nothing to download.
        </p>
        <div className={cn(styles.enter, "mt-9 mx-auto flex max-w-[360px] flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center")} style={delay(3)}>
          <Link href="/organizer/apply" className={cn(styles.btn, styles.btnPrimary)} data-hero-cta>
            Apply as organizer <ArrowRight className="size-4" />
          </Link>
          <Link href="/register" className={cn(styles.btn, styles.btnGhost)}>
            I&apos;m a runner
          </Link>
        </div>
        <p className={cn(styles.enter, "mt-5 text-[13px] text-[var(--muted)]")} style={delay(4)}>
          {priceLabel} for organizers · Free for runners · Installs on any phone
        </p>
      </div>

      {/* Product composition: dashboard, scanner phone and live notifications */}
      <div className={cn(styles.container, "relative z-10 mt-14 sm:mt-20")}>
        <div className={cn(styles.enter, "relative mx-auto max-w-[1080px] pb-16 md:pb-24")} style={delay(5)}>
          <DashboardWindow className="hidden w-[88%] md:block" />

          <div className="relative mx-auto w-fit md:absolute md:bottom-8 md:right-0 md:mx-0">
            <PhoneFrame>
              <ScannerScreen />
            </PhoneFrame>
            <PaymentChip className={cn(styles.float, "absolute -left-6 -top-7 w-max sm:-left-28 md:hidden")} />
            <DuplicateChip className={cn(styles.floatSlow, "absolute -bottom-6 -right-6 w-max sm:-right-24 md:hidden")} />
          </div>

          <PaymentChip className={cn(styles.float, "absolute -left-6 top-[58%] hidden w-max md:flex")} />
          <DuplicateChip className={cn(styles.floatSlow, "absolute bottom-[38%] right-[20%] hidden w-max md:flex")} />
        </div>
      </div>
    </section>
  )
}
