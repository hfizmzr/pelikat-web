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
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5">
          <span className="text-sm font-medium text-primary">
            PRECISION PERFORMANCE
          </span>
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="text-balance">
            Digitizing{" "}
            <span className="text-gradient-purple">Race</span>
            {" "}Management for the{" "}
            <span className="text-gradient-purple">Modern Era.</span>
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mt-6 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg md:text-xl">
          From Pelikat Batik Run to global marathons, Pelikat Batik provides the
          infrastructure to automate logistics, photos, and runner engagement.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/organizer/apply" className="inline-flex items-center gap-2">
              Modernize Your Race
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
