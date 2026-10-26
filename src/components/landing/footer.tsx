import Link from "next/link"
import { cn } from "@/lib/utils"
import { Logo, navLinks } from "./nav"
import styles from "./landing.module.css"

const credits = [
  { title: "Omagh Half Marathon, runners (2)", by: "Kenneth Allen", license: "CC BY-SA 2.0", href: "https://commons.wikimedia.org/wiki/File:Omagh_Half_Marathon_-_runners_(2)_-_geograph.org.uk_-_4403729.jpg" },
  { title: "Cardiff Half Marathon runners", by: "Eirian Evans", license: "CC BY-SA 2.0", href: "https://commons.wikimedia.org/wiki/File:Cardiff_Half_Marathon_runners_-_geograph.org.uk_-_8069976.jpg" },
  { title: "VIVAWEST Marathon 2022", by: "Thomas Krakow", license: "CC BY-SA 4.0", href: "https://commons.wikimedia.org/wiki/File:Runners_of_the_VIVAWEST_Marathon_2022_during_the_half_marathon.jpg" },
]

const columns = [
  { title: "Product", links: navLinks.map((l) => ({ ...l, external: false })) },
  {
    title: "Account",
    links: [
      { label: "Log in", href: "/login" },
      { label: "Create runner account", href: "/register" },
      { label: "Apply as organizer", href: "/organizer/apply" },
    ],
  },
  { title: "Contact", links: [{ label: "admin@pelikat.com", href: "mailto:admin@pelikat.com" }] },
]

export function Footer() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--surface-2)] pb-[calc(96px+env(safe-area-inset-bottom))] pt-14 lg:pb-12">
      <div className={styles.container}>
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className={cn(styles.body, "mt-4 max-w-[34ch]")}>
              Race software for Malaysian running events, from the first entry to
              the last certificate.
            </p>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-[13px] font-semibold">{col.title}</p>
              <ul className="mt-3 grid gap-2.5 text-[14px] text-[var(--muted)]">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith("/") ? (
                      <Link href={l.href} className={styles.link}>{l.label}</Link>
                    ) : (
                      <a href={l.href} className={styles.link}>{l.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-[var(--line)] pt-6 text-[12px] text-[var(--muted)] md:flex-row md:justify-between">
          <p>&copy; {new Date().getFullYear()} Pelikat Batik. All rights reserved.</p>
          <p className="max-w-[90ch] md:text-right">
            Race photos from Wikimedia Commons:{" "}
            {credits.map((c, i) => (
              <span key={c.href}>
                <a href={c.href} className={cn(styles.link, "underline underline-offset-2")} rel="noopener noreferrer" target="_blank">
                  {c.title}
                </a>{" "}
                by {c.by}, {c.license}
                {i < credits.length - 1 ? "; " : "."}
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  )
}
