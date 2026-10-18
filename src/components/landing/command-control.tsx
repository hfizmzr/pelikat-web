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
              One dashboard for race control
            </h2>
            <p className="mt-6 text-base text-muted-foreground sm:text-lg">
              Registrations, vendor payouts, and volunteer deployment on one
              screen. The numbers update as runners check in.
            </p>

            {/* Feature List */}
            <div className="mt-8 space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Database className="size-5" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">
                    One race data feed
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Timing chips, manual entries, and sponsor leads land in the
                    same feed as runners check in.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-foreground">
                    Duplicate and bib-swap detection
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Duplicate registrations and bib swaps are flagged
                    automatically before check-in keys go out.
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
