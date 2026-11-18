import Link from 'next/link'
import { BrandLink } from '@/components/brand-mark'

// Root 404: unmatched URLs and every notFound() without a closer not-found.
// Renders inside the root layout, so it picks up the app theme and fonts.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center px-4 sm:px-8">
        <BrandLink />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-14">
        <div className="max-w-sm text-center">
          <p className="font-mono text-[14px] text-muted-foreground">404</p>
          <h1 className="mt-3 text-2xl font-medium text-foreground">Page not found</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            This link doesn&apos;t lead anywhere. The page may have moved, or the address may be mistyped.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[14px] font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}
