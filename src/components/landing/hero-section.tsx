import Link from "next/link"
import type { CSSProperties } from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { DashboardWindow, DuplicateChip, PhoneFrame, ScannerScreen } from "./product-visuals"
import styles from "./landing.module.css"

const delay = (i: number) => ({ "--i": i }) as CSSProperties

export function HeroSection({ priceLabel }: { priceLabel: string }) {
  return (
    <section className="relative overflow-x-clip pt-12 sm:pt-24" aria-labelledby="hero-title">
      <div className={cn(styles.container, "grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:gap-16")}>
        <h1 id="hero-title" className={cn(styles.h1, styles.enter, "max-w-[14ch]")} style={delay(0)}>
          Malaysian races, from first entry to finisher certificate
        </h1>
        <div className={styles.enter} style={delay(1)}>
          <p className={cn(styles.lead, "max-w-[44ch]")}>
            Registration, DuitNow payments, QR kit collection, race photos and
            e-certificates in one place. Organizers pay {priceLabel}. Runners
            use it free in their browser, with nothing to download.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/organizer/apply" className={cn(styles.btn, styles.btnPrimary)} data-hero-cta>
              Apply as organizer <ArrowRight className="size-4" />
            </Link>
            <Link href="/register" className={cn(styles.btn, styles.btnGhost)}>
              I&apos;m a runner
            </Link>
          </div>
        </div>
      </div>

      {/* Product view: organizer dashboard with the kit-collection scanner */}
      <div className={cn(styles.container, "relative mt-14 sm:mt-20")}>
        <div className={cn(styles.enter, "relative pb-16 md:pb-24")} style={delay(2)}>
          <DashboardWindow className="hidden w-[86%] md:block" />

          <div className="relative mx-auto w-fit md:absolute md:bottom-8 md:right-0 md:mx-0">
            <PhoneFrame>
              <ScannerScreen />
            </PhoneFrame>
            <DuplicateChip className="absolute -bottom-6 -right-4 w-max sm:-right-24 md:-left-72 md:right-auto md:bottom-0" />
          </div>
        </div>
      </div>
    </section>
  )
}
