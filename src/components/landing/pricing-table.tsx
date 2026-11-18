import Link from "next/link"
import { Check } from "lucide-react"
import type { OrganizerSubscriptionPrice } from "@/lib/subscription"
import { formatRM } from "@/lib/merch"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

export function formatPrice(price: OrganizerSubscriptionPrice) {
  return formatRM(price.amount)
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
        <div className="max-w-2xl">
          <h2 id="pricing-title" className={styles.h2}>
            One plan for organizers, free for runners
          </h2>
          <p className={cn(styles.lead, "mt-4")}>No tiers to compare. Organizers get every feature, and runners never pay to sign up.</p>
        </div>

        <div className="mt-12 grid max-w-[880px] gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <div key={plan.name} className={cn(styles.card, "flex flex-col p-6 sm:p-8")}>
              <h3 className={styles.h3}>{plan.name}</h3>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-[44px] font-medium leading-none tracking-[-0.02em] tabular-nums">{plan.price}</span>
                <span className="text-[15px] text-[var(--muted)]">{plan.period}</span>
              </p>
              <p className={cn(styles.body, "mt-3")}>{plan.blurb}</p>
              <ul className="mt-6 grid gap-3 text-[15px]">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check className="mt-0.5 size-[18px] shrink-0 text-[var(--muted)]" strokeWidth={1.75} />
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
