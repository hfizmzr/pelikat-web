"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { BadgeCheck, BarChart3, Camera, Check, CreditCard, Loader2, QrCode, Route } from "lucide-react"
import ApplyForm from "@/components/organizer/apply-form"

const features = [
  { icon: CreditCard, title: "Registration and payments", description: "Categories and prices per event. Runners pay by DuitNow QR, FPX or card through HitPay." },
  { icon: QrCode, title: "QR kit collection", description: "Every entry gets a QR key. Scan it at the counter from any phone; duplicates are flagged." },
  { icon: Camera, title: "Race photos by bib", description: "Upload the photographers' sets and photos are matched to runners by bib number." },
  { icon: BadgeCheck, title: "Badges and e-certificates", description: "Finishers earn badges, and each badge issues a certificate with their name and bib." },
  { icon: Route, title: "Virtual runs", description: "Set a target distance. Runners log runs by GPS on their phone and the badge follows." },
  { icon: BarChart3, title: "Analytics and merch", description: "Registrations, revenue and demographics per event, plus a merch store collected at kit pickup." },
]

export default function OrganizerApplyPage() {
  const [showForm, setShowForm] = useState(false)
  // DB-configured price (public config endpoint). Runner accounts are
  // always free — only organizers pay the single subscription tier.
  const [price, setPrice] = useState<{
    amount: number
    period: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/subscription/price')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.amount > 0) {
          setPrice({ amount: data.amount, period: data.period ?? 'year' })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (showForm) {
    return <ApplyForm />
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)]">
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:items-start lg:py-24">
        <div>
          <h1 className="max-w-[18ch] text-[36px] leading-[1.08] font-medium tracking-[-0.02em] text-foreground sm:text-[48px]">
            Run your races on Pelikat
          </h1>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">
            Apply with your organizer details and first event. Once you are approved and subscribed,
            publish the event and entries open.
          </p>

          <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <li key={feature.title}>
                  <h2 className="flex items-center gap-2.5 text-[15px] font-medium text-foreground">
                    <Icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
                    {feature.title}
                  </h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{feature.description}</p>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 lg:sticky lg:top-8">
          <h2 className="text-[16px] font-medium text-foreground">Organizer subscription</h2>
          <p className="mt-1 text-[14px] text-muted-foreground">One plan with every feature</p>
          <p className="mt-6 flex items-baseline gap-1.5">
            {price ? (
              <>
                <span className="text-[40px] leading-none font-medium tabular-nums text-foreground">RM {price.amount.toFixed(2)}</span>
                <span className="text-[15px] text-muted-foreground">a {price.period}</span>
              </>
            ) : (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            )}
          </p>
          <ul className="mt-6 space-y-2.5">
            {[
              "Unlimited events during your subscription",
              "Payments, kit collection and photos",
              "Badges, e-certificates and virtual runs",
              "Analytics, merch and complimentary entries",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[14px] text-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                {item}
              </li>
            ))}
          </ul>
          <Button size="lg" className="mt-8 w-full" onClick={() => setShowForm(true)}>
            Apply as organizer
          </Button>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Runner accounts are free. Runners pay only the entry fee you set and any merch they order.
          </p>
        </div>
      </section>
    </div>
  )
}
