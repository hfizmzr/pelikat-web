import Image from "next/image"
import { Camera, QrCode, Trophy, BarChart3 } from "lucide-react"
import { FeatureCard } from "./feature-card"

export function FeaturesSection() {
  return (
    <section id="features" className="w-full py-20 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Every system your race runs on
        </h2>

        {/* Bento Grid — asymmetric 6-col: 4+2 / 2+4 */}
        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-6">
          {/* AI Photo Engine — hero cell */}
          <FeatureCard
            icon={<Camera className="size-5" />}
            title="AI Photo Engine"
            description="Runners search their bib number and their race photos surface in seconds. No galleries to scroll through."
            className="lg:col-span-4"
          >
            <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-lg">
              <Image
                src="/images/camera-lens.jpg"
                alt="Camera lens representing AI photo technology"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 66vw"
              />
            </div>
          </FeatureCard>

          {/* Secure REPC — tinted cell */}
          <FeatureCard
            icon={<QrCode className="size-5" />}
            title="Secure REPC"
            description="QR-based race kit collection with a unique digital key per runner. Cuts REPC queue time and flags duplicates on the spot."
            className="bg-secondary/50 lg:col-span-2"
          />

          {/* Virtual Run Tracker — tinted cell */}
          <FeatureCard
            icon={<Trophy className="size-5" />}
            title="Virtual Run Tracker"
            description="Virtual runs with digital badges and instant e-certificates on completion, keeping club members active between races."
            className="bg-primary/5 lg:col-span-2"
          />

          {/* Real-time Analytics — wide cell */}
          <FeatureCard
            icon={<BarChart3 className="size-5" />}
            title="Real-time Analytics"
            description="Live registration counts, category splits, and checkpoint status on one dashboard, so you can watch turnout as it happens."
            className="lg:col-span-4"
          />
        </div>
      </div>
    </section>
  )
}
