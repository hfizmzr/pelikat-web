import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Header } from "@/components/landing/header"
import { HeroSection } from "@/components/landing/hero-section"
import { FeaturesBento } from "@/components/landing/features-bento"
import { StepsSection } from "@/components/landing/steps-section"
import { RunnerApp } from "@/components/landing/runner-app"
import { PricingTable, formatPrice } from "@/components/landing/pricing-table"
import { FaqSection } from "@/components/landing/faq-section"
import { CTASection } from "@/components/landing/cta-section"
import { Footer } from "@/components/landing/footer"
import { MobileActionBar } from "@/components/landing/mobile-action-bar"
import { RevealObserver } from "@/components/landing/reveal-observer"
import { ActivityTicker } from "@/components/landing/activity-ticker"
import { AmbientBackground, SpotlightTracker } from "@/components/landing/ambient"
import styles from "@/components/landing/landing.module.css"
import { getUserRole } from "@/lib/auth/requireRole"
import { createClient } from "@/lib/supabase/server"
import { getOrganizerSubscriptionPrice } from "@/lib/subscription"

export const metadata: Metadata = {
  title: 'Pelikat',
  description: "Race management platform for Malaysian runners and event organizers",
}

// Signed-in users (including the installed PWA, whose start_url is "/")
// go straight to their own home. The proxy still applies the payment,
// subscription and profile gates on those routes.
const HOME_BY_ROLE = {
  admin: '/admin',
  organizer: '/organizer',
  expired: '/organizer/subscription-expired',
  runner: '/runner',
} as const

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(HOME_BY_ROLE[getUserRole(user)])

  // Live price from platform_settings; reading it keeps this page dynamic.
  const price = await getOrganizerSubscriptionPrice(supabase)
  const priceLabel = `${formatPrice(price)} a ${price.period}`

  return (
    <div className={styles.root}>
      <AmbientBackground />
      {/* Gate the entrance animations on JS before first paint, so content
          is never hidden for visitors without scripts. */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main-content">
        <HeroSection priceLabel={priceLabel} />
        <ActivityTicker />
        <FeaturesBento />
        <StepsSection priceLabel={priceLabel} />
        <RunnerApp />
        <PricingTable price={price} />
        <FaqSection priceLabel={priceLabel} />
        <CTASection />
      </main>
      <Footer />
      <MobileActionBar />
      <RevealObserver />
      <SpotlightTracker />
    </div>
  )
}
