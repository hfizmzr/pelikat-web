import Image from "next/image"
import Link from "next/link"
import {
  Camera,
  QrCode,
  Trophy,
  BarChart3,
} from "lucide-react"
import { 
  FaInstagram, 
  FaTwitter 
} from "react-icons/fa"
import { Badge } from "@/components/ui/badge"
import { FeatureCard } from "./feature-card"

export function FeaturesSection() {
  return (
    <section id="features" className="w-full py-20 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Powerful Features
        </h2>

        {/* Bento Grid */}
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* AI Photo Engine - Large Card */}
          <FeatureCard
            icon={<Camera className="size-5" />}
            title="AI Photo Engine"
            description="Find My Photos instantly. Using facial and bib recognition, runners can locate their action shots in seconds across thousands of race files."
            className="row-span-2 md:col-span-1"
          >
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                100% Accuracy
              </Badge>
              <Badge variant="outline" className="text-xs">
                Instant Search
              </Badge>
            </div>
            <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-lg">
              <Image
                src="/images/camera-lens.jpg"
                alt="Camera lens representing AI photo technology"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            </div>
          </FeatureCard>

          {/* Secure REPC */}
          <FeatureCard
            icon={<QrCode className="size-5" />}
            title="Secure REPC"
            description="Advanced QR & Relay Protocol. Streamlined race kit collection with unique digital keys and encrypted runner identification."
            className="md:col-span-1"
          >
            <Link
              href="#"
              className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline"
            >
              Encrypted Authentication
            </Link>
          </FeatureCard>

          {/* Stats Display Card */}
          <div className="flex flex-col rounded-xl border border-border bg-card p-6 md:col-span-1">
            <div className="flex items-center justify-between">
              <div className="h-2 w-24 rounded-full bg-primary/20">
                <div className="h-2 w-16 rounded-full bg-primary" />
              </div>
              <div className="h-2 w-12 rounded-full bg-primary" />
            </div>
            <div className="mt-auto pt-8">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Active Runners</p>
                  <p className="text-2xl font-bold text-foreground">2,451</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Checkpoints</p>
                  <p className="text-2xl font-bold text-foreground">08/12</p>
                </div>
              </div>
            </div>
          </div>

          {/* Virtual Run Tracker */}
          <FeatureCard
            icon={<Trophy className="size-5" />}
            title="Virtual Run Tracker"
            description="Gamified experience with custom digital badges and instant downloadable e-certificates upon completion."
            className="md:col-span-1"
          >
            <div className="mt-4 flex gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#1DA1F2]/10 text-[#1DA1F2]">
                <FaTwitter className="size-4" />
              </span>
              <span className="flex size-8 items-center justify-center rounded-full bg-[#E1306C]/10 text-[#E1306C]">
                <FaInstagram className="size-4" />
              </span>
            </div>
          </FeatureCard>

          {/* Real-time Analytics */}
          <FeatureCard
            icon={<BarChart3 className="size-5" />}
            title="Real-time Analytics"
            description="Live event heatmaps, registration velocity, and timing checkpoint data for organizers. Manage your event with surgical precision."
            className="md:col-span-1"
          />
        </div>
      </div>
    </section>
  )
}
