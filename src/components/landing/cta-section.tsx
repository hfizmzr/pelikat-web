import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

export function CTASection() {
  return (
    <section className={styles.section} aria-labelledby="cta-title">
      <div className={cn(styles.container, "text-center")}>
        <h2 id="cta-title" className={cn(styles.h2, "mx-auto max-w-[18ch]")}>
          Ready for your next race morning?
        </h2>
        <p className={cn(styles.lead, "mx-auto mt-4 max-w-[48ch]")}>
          Apply with your organizer details and first event. Once you&apos;re
          approved and subscribed, publish it and entries open.
        </p>
        <div className="mt-8 mx-auto flex max-w-[360px] flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
          <Link href="/organizer/apply" className={cn(styles.btn, styles.btnPrimary)}>
            Apply as organizer <ArrowRight className="size-4" />
          </Link>
          <Link href="/login" className={cn(styles.btn, styles.btnGhost)}>
            Log in
          </Link>
        </div>
      </div>
    </section>
  )
}
