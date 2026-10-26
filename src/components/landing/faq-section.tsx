import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import styles from "./landing.module.css"

export function FaqSection({ priceLabel }: { priceLabel: string }) {
  const faqs = [
    {
      q: "Do runners need to install an app?",
      a: "No. Pelikat runs in the browser and can be added to the home screen, where it opens full-screen like an app. Registration, payment, the bib and race photos all live there.",
    },
    {
      q: "How do runners pay?",
      a: "Through HitPay, by DuitNow QR, FPX or card. Payment is confirmed automatically and the registration updates on its own.",
    },
    {
      q: "What does it cost?",
      a: `Organizers pay ${priceLabel}. Runner accounts are free. Runners pay only the entry fee you set and any merch they order.`,
    },
    {
      q: "How is runner data protected?",
      a: "IC and passport documents are encrypted, and organizers see masked identity details rather than the documents. Runners give PDPA consent before uploading anything.",
    },
    {
      q: "Can we give out free entries?",
      a: "Yes. Add complimentary entries for sponsors, pacers or guests. They get a confirmed entry and a bib without paying.",
    },
    {
      q: "Can we run a virtual event?",
      a: "Yes. Make the event virtual and set a target distance. Runners log their runs by GPS and earn the badge and certificate when they reach it.",
    },
    {
      q: "How do we get started?",
      a: "Apply as an organizer with your details and your first event. Once the application is approved and you subscribe, you can publish the event and open entries.",
    },
  ]

  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-title">
      <div className={cn(styles.container, "grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16")}>
        <div data-reveal="">
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            FAQ
          </span>
          <h2 id="faq-title" className={cn(styles.h2, "mt-5")}>
            Questions organizers ask
          </h2>
          <p className={cn(styles.body, "mt-4 max-w-[36ch]")}>
            Something else? Email{" "}
            <a href="mailto:admin@pelikat.com" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
              admin@pelikat.com
            </a>
            .
          </p>
        </div>
        <div className={cn(styles.card, "px-6 py-2 sm:px-8")} data-reveal="">
          {faqs.map((item, i) => (
            <details key={item.q} className={cn(styles.faqItem, i === faqs.length - 1 && "border-b-0")} open={i === 0}>
              <summary>
                {item.q}
                <Plus className={cn(styles.faqIcon, "size-5")} aria-hidden="true" />
              </summary>
              <p className={cn(styles.body, "pb-5 pr-8")}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
