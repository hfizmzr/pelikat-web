import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="relative min-h-[600px] w-full overflow-hidden lg:min-h-[700px]">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 ">
        <Image
          src="/images/hero-runner1.jpg"
          alt=""
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
        />
        {/* Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/80 to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        {/* Headline */}
        <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="text-balance">
            Every race,{" "}
            <span className="text-primary">managed end to end.</span>
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mt-6 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg md:text-xl">
          Pelikat Batik handles registration, bib collection, timing data, and
          finisher photos for Malaysian events, from fun runs to full marathons.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-primary text-primary-foreground hover:brightness-95"
          >
            <Link href="/organizer/apply" className="inline-flex items-center gap-2">
              Get Started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
