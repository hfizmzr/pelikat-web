import Link from "next/link"
import type { CSSProperties } from "react"
import { Check } from "lucide-react"
import type { OrganizerSubscriptionPrice } from "@/lib/subscription"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

export function formatPrice(price: OrganizerSubscriptionPrice) {
  const amount = Number.isInteger(price.amount) ? String(price.amount) : price.amount.toFixed(2)
  return `RM${amount}`
}

export function PricingTable({ price }: { price: OrganizerSubscriptionPrice }) {
  const plans = [
    {
      name: "Runner",
      price: "Free",
      period: "always",
      blurb: "For anyone joining a race. Pay only the entry fee the organizer sets.",
      features: [
        "Register and pay for any published event",
        "Bib and QR key for kit collection",
        "Race photos by bib number",
        "Badges, e-certificates and run log",
        "Installs on any phone",
      ],
      href: "/register",
      cta: "Create runner account",
      featured: false,
    },
    {
      name: "Organizer",
      price: formatPrice(price),
      period: `per ${price.period}`,
      blurb: `One subscription for ${price.durationDays} days. Every feature included.`,
      features: [
        "In-person and virtual events",
        "Payments by DuitNow QR, FPX and card via HitPay",
        "QR kit collection and check-in scanner",
        "Race photo uploads and bib search",
        "Complimentary entries for sponsors and guests",
        "Merch store, analytics and refunds",
      ],
      href: "/organizer/apply",
      cta: "Apply as organizer",
      featured: true,
    },
  ]

  return (
    <section id="pricing" className={styles.section} aria-labelledby="pricing-title">
      <div className={styles.container}>
        <div className="mx-auto max-w-2xl text-center" data-reveal="">
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Pricing
          </span>
          <h2 id="pricing-title" className={cn(styles.h2, "mt-5")}>
            One plan for organizers. Free for runners.
          </h2>
          <p className={cn(styles.lead, "mt-4")}>No tiers to compare. Organizers get every feature, and runners never pay to sign up.</p>
        </div>

        <div className="mx-auto mt-14 grid max-w-[880px] gap-5 md:grid-cols-2">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={cn(styles.card, styles.spot, "flex flex-col p-7", plan.featured && styles.priceFeatured)}
              data-reveal=""
              data-spotlight=""
              style={{ "--i": i } as CSSProperties}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-semibold">{plan.name}</h3>
                {plan.featured && <span className={cn(styles.pill, styles.pillAccent)}>For organizers</span>}
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-[48px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{plan.price}</span>
                <span className="text-[15px] text-[var(--muted)]">{plan.period}</span>
              </p>
              <p className={cn(styles.body, "mt-3")}>{plan.blurb}</p>
              <ul className="mt-6 grid gap-3 text-[15px]">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className="mt-0.5 size-[18px] shrink-0 text-[var(--accent)]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={cn(styles.btn, plan.featured ? styles.btnPrimary : styles.btnGhost, "mt-8 w-full")}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
