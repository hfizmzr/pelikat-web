import Link from "next/link"

const footerLinks = [
  { label: "Contact Support", href: "mailto:admin@pelikat.com" },
]

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          {/* Brand */}
          <div>
            <span className="text-sm font-semibold text-foreground">
              Pelikat Batik
            </span>
          </div>

          {/* Links */}
          <nav
            className="flex flex-wrap items-center justify-center gap-6"
            aria-label="Footer navigation"
          >
            {footerLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; 2024 Pelikat Batik. Precision in Darkness.
          </p>
        </div>
      </div>
    </footer>
  )
}
