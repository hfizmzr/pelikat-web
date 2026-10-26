import Link from "next/link"
import styles from "./landing.module.css"

export const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Runners", href: "#runners" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Pelikat Batik home">
      <span className={styles.logoMark} aria-hidden="true">P</span>
      <span className="text-[16px] font-semibold tracking-tight">Pelikat Batik</span>
    </Link>
  )
}
