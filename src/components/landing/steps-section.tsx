import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

export function StepsSection({ priceLabel }: { priceLabel: string }) {
  const steps = [
    {
      title: "Apply and subscribe",
      body: `Send your organizer details and first event. Once approved, one subscription of ${priceLabel} covers the year.`,
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
    <section id="how-it-works" className={cn(styles.section, "relative isolate")} aria-labelledby="how-title">
      <div className={styles.dots} aria-hidden="true" />
      <div className={styles.container}>
        <div className="max-w-2xl" data-reveal="">
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            How it works
          </span>
          <h2 id="how-title" className={cn(styles.h2, "mt-5")}>
            From application to start line in three steps
          </h2>
        </div>

        <ol className="relative mt-12 grid gap-5 md:grid-cols-3">
          <span className={cn(styles.stepLine, "hidden md:block")} aria-hidden="true" />
          {steps.map((step, i) => (
            <li
              key={step.title}
              className={cn(styles.card, styles.spot, "relative p-6")}
              data-reveal=""
              data-spotlight=""
              style={{ "--i": i } as CSSProperties}
            >
              <span className={styles.stepNum}>{i + 1}</span>
              <h3 className={cn(styles.h3, "mt-5")}>{step.title}</h3>
              <p className={cn(styles.body, "mt-2")}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
