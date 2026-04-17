import { Database, ShieldCheck } from "lucide-react"
import { DashboardPreview } from "./dashboard-preview"

export function CommandControl() {
  return (
    <section id="organizers" className="w-full py-20 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Content */}
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Command & Control
            </h2>
            <p className="mt-6 text-base text-muted-foreground sm:text-lg">
              A unified dashboard built for speed and precision. Manage
              registrations, vendor payouts, and volunteer deployment from a
              single interface.
            </p>

            {/* Feature List */}
            <div className="mt-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Database className="size-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Centralized Race Hub
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Consolidate data from physical timing chips, manual
                    registrations, and sponsor leads in real-time.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Fraud Prevention
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Flag duplicate registrations and bib swapping automatically
                    with our integrated identity verification system.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="lg:pl-8">
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  )
}
