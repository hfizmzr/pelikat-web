import { CheckCircle, MoreHorizontal } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { PhoneMockup } from "./phone-mockup"

export function RunnerExperience() {
  return (
    <section id="runners" className="w-full py-20 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Phone Mockup */}
          <div className="order-2 lg:order-1">
            <PhoneMockup>
              <div className="p-4">
                {/* App Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">
                    PELIKAT RUN
                  </span>
                  <button className="text-muted-foreground">
                    <MoreHorizontal className="size-5" />
                  </button>
                </div>

                {/* User Card */}
                <div className="mt-6 flex items-center gap-3">
                  <Avatar className="size-12 border-2 border-primary">
                    <AvatarImage src="/placeholder.svg" alt="Adam Razak" />
                    <AvatarFallback className="bg-primary/20 text-primary">
                      AR
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-semibold text-foreground">Adam Razak</h4>
                    <p className="text-xs text-muted-foreground">
                      21K runner - Elite Group
                    </p>
                  </div>
                </div>

                {/* Current Pace */}
                <div className="mt-6 flex items-center justify-between rounded-lg bg-secondary/50 p-4">
                  <span className="text-xs text-muted-foreground">
                    CURRENT PACE
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    6.42 MIN/KM
                  </span>
                </div>

                {/* Stats Row */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-secondary/50 p-4">
                    <p className="text-2xl font-bold text-foreground">13.42M</p>
                    <p className="text-xs text-muted-foreground">Distance</p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-4">
                    <p className="text-2xl font-bold text-foreground">01:08</p>
                    <p className="text-xs text-muted-foreground">Time</p>
                  </div>
                </div>

                {/* Finish Photos Button */}
                <Button className="mt-6 w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  FINISH PHOTOS
                </Button>
              </div>
            </PhoneMockup>
          </div>

          {/* Content */}
          <div className="order-1 lg:order-2">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              <span className="text-balance">
                The Complete{" "}
                <span className="text-gradient-purple">Runner Experience</span>
              </span>
            </h2>
            <p className="mt-6 text-base text-muted-foreground sm:text-lg">
              No apps to download. Our Progressive Web App (PWA) gives runners
              everything they need through a simple link. Instant results, photo
              access, and digital medals at their fingertips.
            </p>

            {/* Feature List */}
            <ul className="mt-8 space-y-4">
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 size-5 flex-shrink-0 text-success" />
                <div>
                  <h4 className="font-semibold text-foreground">
                    Zero Friction Access
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Share results and race photos without app stores.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 size-5 flex-shrink-0 text-success" />
                <div>
                  <h4 className="font-semibold text-foreground">
                    Interactive Route Maps
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Live GPS tracking and water station locators.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
