// Covers: shared Playwright helpers (seeded-event sign-in/shortcuts) — support file, no direct FR coverage

import type { Page } from '@playwright/test'

/**
 * Email/password login through the standard /login form (seeded dev accounts
 * — all passwords come from supabase/seed.sql: `Pelikat-Dev-2026!`).
 * Resolves once the middleware has landed us off /login.
 */
export async function login(page: Page, email: string) {
  const password = 'Pelikat-Dev-2026!'
  await page.goto('/login')
  // Dev-mode hydration settle: before React is live the submit is a native
  // (dead) form POST — WebKit is fast enough to hit that window consistently.
  await page.waitForLoadState('networkidle')
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15000 })
  // Let the post-login router.push land before the caller navigates on.
  await page.waitForLoadState('networkidle')
}

/**
 * goto() with a retry for the WebKit "interrupted by another navigation"
 * race: the post-login SPA router.push can still be settling when the
 * caller's navigation fires — replaying the goto is always correct there.
 */
export async function goto(page: Page, path: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(path, { timeout: 20000 })
      return
    } catch (error) {
      const interrupted = String(error).includes('interrupted by another navigation')
      if (!interrupted || attempt >= 5) throw error
      // The contending SPA push is in flight: let it finish, take a breath.
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
}
