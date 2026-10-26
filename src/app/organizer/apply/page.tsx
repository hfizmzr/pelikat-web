"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle, Camera, QrCode, BarChart3, LayoutDashboard, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import ApplyForm from "@/components/organizer/apply-form"

const features = [
  { icon: Camera, title: "AI Photo Engine", description: "Facial and bib recognition for instant runner photo search." },
  { icon: QrCode, title: "Secure REPC", description: "QR-based race kit collection with encrypted runner identification." },
  { icon: BarChart3, title: "Real-time Analytics", description: "Live event heatmaps, registration velocity, and timing data." },
  { icon: LayoutDashboard, title: "Unified Dashboard", description: "Manage registrations, volunteers, and vendors from one place." },
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
    <div className="min-h-dvh">
      {/* Hero */}
      <section className="w-full py-20 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Become a{" "}
            <span className="text-primary">Pelikat Batik</span>{" "}
            Organizer
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg text-muted-foreground">
            Run your events on Malaysia&apos;s premier race management platform.
            From registration to finisher photos, we handle the infrastructure
            so you can focus on the experience.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="w-full pb-20 sm:pb-24 lg:pb-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto">
            <Card className="border-primary/30 bg-card">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-2xl font-bold">Organizer Subscription</CardTitle>
                <CardDescription>One tier. Everything included.</CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-6">
                <div>
                  <span className="text-5xl font-bold text-foreground">
                    RM {price ? price.amount.toFixed(2) : <Loader2 className="mx-auto size-9 animate-spin text-muted-foreground" />}
                  </span>
                  <span className="text-muted-foreground">/{price?.period ?? 'year'}</span>
                </div>
                <ul className="space-y-3 text-left">
                  {[
                    "Unlimited events per year",
                    "AI photo engine for all runners",
                    "Secure REPC race kit collection",
                    "Real-time analytics dashboard",
                    "Runner PWA with live tracking",
                    "Dedicated support",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 size-5 flex-shrink-0 text-success" />
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <Button size="lg" className="w-full bg-primary text-primary-foreground hover:brightness-95" onClick={() => setShowForm(true)}>
                  Apply Now
                </Button>
                <p className="text-xs text-muted-foreground">
                  Runner accounts are always free — runners pay only per event registration or merch order.
                  The single subscription tier applies to organizers only.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="w-full pb-20 sm:pb-24 lg:pb-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl text-center mb-12">
            Everything you need
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <Card key={feature.title} className="border-border">
                  <CardHeader>
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
