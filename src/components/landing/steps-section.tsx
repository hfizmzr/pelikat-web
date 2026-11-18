import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

export function StepsSection({ priceLabel }: { priceLabel: string }) {
  const steps = [
    {
      title: "Apply and subscribe",
      body: `Send your organizer details and first event. Once approved, one subscription at ${priceLabel} covers every feature.`,
    },
    {
      title: "Publish your event",
      body: "Add categories, prices, date and location, in person or virtual. Publish it and runners can register and pay straight away.",
    },
    {
      title: "Run race day",
      body: "Scan QR keys at kit collection, upload race photos and let certificates go out as runners finish.",
    },
  ]

  return (
    <section id="how-it-works" className={styles.section} aria-labelledby="how-title">
      <div className={styles.container}>
        <h2 id="how-title" className={cn(styles.h2, "max-w-2xl")}>
          From application to start line in three steps
        </h2>

        <ol className="mt-12 grid gap-8 border-t border-[var(--line)] pt-8 md:grid-cols-3 md:gap-12">
          {steps.map((step, i) => (
            <li key={step.title}>
              <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
              <h3 className={cn(styles.h3, "mt-3")}>{step.title}</h3>
              <p className={cn(styles.body, "mt-2")}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
