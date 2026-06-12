import { Header } from "@/components/landing/header"
import { HeroSection } from "@/components/landing/hero-section"
import { FeaturesSection } from "@/components/landing/features-section"
import { RunnerExperience } from "@/components/landing/runner-experience"
import { CommandControl } from "@/components/landing/command-control"
import { CTASection } from "@/components/landing/cta-section"
import { Footer } from "@/components/landing/footer"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pelikat',
  description: "Malaysia's premier race management platform for runners and organizers",
}

export default function Home() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main-content">
        <HeroSection />
        <FeaturesSection />
        <RunnerExperience />
        <CommandControl />
        <CTASection />
      </main>
      <Footer />
    </>
  )
}
