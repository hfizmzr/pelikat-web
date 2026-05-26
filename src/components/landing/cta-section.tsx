import Link from "next/link"
import { Button } from "@/components/ui/button"

export function CTASection() {
  return (
    <section className="w-full py-20 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl bg-gradient-cta px-6 py-16 text-center sm:px-12 sm:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            <span className="text-balance">Ready to Elevate Your Next Event?</span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-white/80 sm:text-lg">
            Join hundreds of organizers using Pelikat Batik to deliver flawless race
            experiences. Scale your operations without increasing complexity.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-background text-foreground hover:bg-background/90"
            >
              <Link href="/organizer/apply">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
